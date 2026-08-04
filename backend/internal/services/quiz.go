package services

import (
	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"errors"
	"math"
	"sort"

	"gorm.io/gorm"
)

type QuizService struct {
	db *gorm.DB
}

func NewQuizService(db *gorm.DB) *QuizService {
	return &QuizService{db: db}
}

var (
	ErrQuizQuestionNotFound   = errors.New("ไม่พบคำถาม")
	ErrQuizOptionNotFound     = errors.New("ไม่พบตัวเลือก")
	ErrQuizOptionCourseNotFound = errors.New("ไม่พบคอร์สที่แนะนำนี้")
	ErrQuizCourseNotActive    = errors.New("ไม่สามารถแนะนำคอร์สนี้ได้ เนื่องจากคอร์สไม่มีอยู่หรือยังไม่เปิดใช้งาน (ต้องเป็นสถานะ active)")
)

const recommendTopN = 3

// orderedOptions preload ตัวเลือกโดยเรียงตามลำดับสร้าง (id) ให้ลำดับคงที่ (Q-G)
func orderedOptions(db *gorm.DB) *gorm.DB {
	return db.Order("id ASC")
}

// Admin: Get all questions (including inactive)
// (Q-G) เรียง sequence ASC แล้ว tie-break ด้วย id เพื่อให้ลำดับคงที่แม้ sequence จะชนกัน
func (s *QuizService) GetAllQuestions() ([]dto.QuizQuestionResponse, error) {
	var questions []models.QuizQuestion
	err := s.db.
		Preload("Options", orderedOptions).
		Preload("Options.RecommendedCourses.Course").
		Order("sequence ASC, id ASC").Find(&questions).Error
	if err != nil {
		return nil, err
	}
	return s.mapToResponses(questions), nil
}

// Public/Customer: Get active questions
func (s *QuizService) GetActiveQuestions() ([]dto.QuizQuestionResponse, error) {
	var questions []models.QuizQuestion
	err := s.db.
		Preload("Options", orderedOptions).
		Preload("Options.RecommendedCourses.Course").
		Where("is_active = ?", true).Order("sequence ASC, id ASC").Find(&questions).Error
	if err != nil {
		return nil, err
	}
	return s.mapToResponses(questions), nil
}

func (s *QuizService) Recommend(optionIDs []uint) ([]dto.RecommendedCourseDTO, bool, error) {
	if len(optionIDs) == 0 {
		return []dto.RecommendedCourseDTO{}, true, nil
	}

	var opts []models.QuizOption
	if err := s.db.Select("id", "question_id").Where("id IN ?", optionIDs).Find(&opts).Error; err != nil {
		return nil, false, err
	}
	questionByOption := make(map[uint]uint, len(opts))
	for _, o := range opts {
		questionByOption[o.ID] = o.QuestionID
	}

	var mappings []models.QuizOptionCourse
	if err := s.db.Preload("Course").
		Where("option_id IN ?", optionIDs).
		Find(&mappings).Error; err != nil {
		return nil, false, err
	}

	scoreByCourse := make(map[uint]int)
	coverageByCourse := make(map[uint]map[uint]bool)
	for _, m := range mappings {

		qid, ok := questionByOption[m.OptionID]
		if !ok {
			continue
		}
		// กรองเฉพาะคอร์ส active — คอร์สที่ถูกลบ/draft/inactive ไม่ถูกแนะนำ
		if m.Course == nil || m.Course.Status != models.CourseStatusActive || m.Weight <= 0 {
			continue
		}
		scoreByCourse[m.CourseID] += m.Weight
		if coverageByCourse[m.CourseID] == nil {
			coverageByCourse[m.CourseID] = make(map[uint]bool)
		}
		coverageByCourse[m.CourseID][qid] = true
	}

	if len(scoreByCourse) == 0 {
		return []dto.RecommendedCourseDTO{}, true, nil
	}

	// สโคปให้แคบ: หา "ความครอบคลุมสูงสุด" (ตรงกับคำถามมากที่สุด)
	// แล้วเก็บเฉพาะคอร์สที่ตรงมากที่สุดเท่านั้น → ตอบยิ่งเยอะ ผลยิ่งแคบ
	maxCoverage := 0
	for courseID := range scoreByCourse {
		if c := len(coverageByCourse[courseID]); c > maxCoverage {
			maxCoverage = c
		}
	}

	results := make([]dto.RecommendedCourseDTO, 0)
	for courseID, score := range scoreByCourse {
		if len(coverageByCourse[courseID]) < maxCoverage {
			continue // ตัดคอร์สที่ครอบคลุมน้อยกว่าสุดออก (สโคปเล็กลง)
		}
		results = append(results, dto.RecommendedCourseDTO{CourseID: courseID, Score: score})
	}

	// เรียง: แต้มมากก่อน, เสมอกันตัดด้วย course id น้อยก่อน
	sort.Slice(results, func(i, j int) bool {
		if results[i].Score != results[j].Score {
			return results[i].Score > results[j].Score
		}
		return results[i].CourseID < results[j].CourseID
	})

	topScore := results[0].Score
	for i := range results {
		if topScore > 0 {
			results[i].MatchPercent = int(math.Round(float64(results[i].Score) / float64(topScore) * 100))
		}
	}

	if len(results) > recommendTopN {
		results = results[:recommendTopN]
	}

	return results, false, nil
}

func (s *QuizService) AddOptionCourse(optionID uint, req dto.AddOptionCourseReq) (*models.QuizOptionCourse, error) {
	var opt models.QuizOption
	if err := s.db.First(&opt, optionID).Error; err != nil {
		return nil, ErrQuizOptionNotFound
	}

	var course models.Course
	if err := s.db.First(&course, req.CourseID).Error; err != nil {
		return nil, ErrQuizCourseNotActive
	}
	if course.Status != models.CourseStatusActive {
		return nil, ErrQuizCourseNotActive
	}

	weight := req.Weight
	if weight <= 0 {
		weight = 1
	}

	// (Q-D) กันแมปซ้ำ — ถ้าตัวเลือกนี้ผูกคอร์สนี้อยู่แล้ว อัปเดต weight แทนการสร้างแถวใหม่
	// (ไม่งั้นคะแนนของคอร์สจะถูกบวกซ้ำหลายรอบทั้งที่ coverage เป็นคำถามเดียว ทำให้อันดับเพี้ยน)
	var existing models.QuizOptionCourse
	err := s.db.Where("option_id = ? AND course_id = ?", optionID, req.CourseID).First(&existing).Error
	if err == nil {
		existing.Weight = weight
		if err := s.db.Save(&existing).Error; err != nil {
			return nil, errors.New("ไม่สามารถอัปเดตน้ำหนักคอร์สที่แนะนำได้")
		}
		return &existing, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	row := models.QuizOptionCourse{OptionID: optionID, CourseID: req.CourseID, Weight: weight}
	if err := s.db.Create(&row).Error; err != nil {
		return nil, errors.New("ไม่สามารถบันทึกคอร์สที่แนะนำได้")
	}
	return &row, nil
}

// DeleteOptionCourse ลบการแมปคอร์สออกจากตัวเลือก
// (Q-F) ถ้าไม่มีแถวถูกลบ (id ไม่มีจริง) คืน not found แทนการตอบสำเร็จ
func (s *QuizService) DeleteOptionCourse(id uint) error {
	res := s.db.Delete(&models.QuizOptionCourse{}, id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrQuizOptionCourseNotFound
	}
	return nil
}

func (s *QuizService) CreateQuestion(req dto.CreateQuizQuestionReq) (*models.QuizQuestion, error) {
	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	// (Q-G) กำหนด sequence ที่ฝั่ง server = max(sequence ปัจจุบัน) + 1 เสมอ
	// เพื่อเลี่ยงลำดับชนกัน/มีช่องว่างจากการที่ frontend คำนวณ questions.length + 1 เอง
	var maxSeq int
	s.db.Model(&models.QuizQuestion{}).Select("COALESCE(MAX(sequence), 0)").Scan(&maxSeq)

	q := models.QuizQuestion{
		Text:     req.Text,
		Sequence: maxSeq + 1,
		IsActive: isActive,
	}

	if err := s.db.Create(&q).Error; err != nil {
		return nil, errors.New("ไม่สามารถสร้างคำถามได้")
	}
	return &q, nil
}

func (s *QuizService) UpdateQuestion(id uint, req dto.UpdateQuizQuestionReq) (*models.QuizQuestion, error) {
	var q models.QuizQuestion
	if err := s.db.First(&q, id).Error; err != nil {
		return nil, ErrQuizQuestionNotFound
	}

	if req.Text != nil {
		q.Text = *req.Text
	}
	if req.Sequence != nil {
		q.Sequence = *req.Sequence
	}
	if req.IsActive != nil {
		q.IsActive = *req.IsActive
	}

	if err := s.db.Save(&q).Error; err != nil {
		return nil, errors.New("อัปเดตคำถามไม่สำเร็จ")
	}
	return &q, nil
}

// DeleteQuestion (Q-E) — soft delete ไม่ trigger DB cascade จึงต้องเก็บกวาดเอง:
// ลบ mapping (quiz_option_courses) ของทุกตัวเลือกในคำถาม → soft delete ตัวเลือก → soft delete คำถาม
func (s *QuizService) DeleteQuestion(id uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var optionIDs []uint
		if err := tx.Model(&models.QuizOption{}).Where("question_id = ?", id).Pluck("id", &optionIDs).Error; err != nil {
			return err
		}
		if len(optionIDs) > 0 {
			// QuizOptionCourse ไม่มี soft delete → hard delete
			if err := tx.Where("option_id IN ?", optionIDs).Delete(&models.QuizOptionCourse{}).Error; err != nil {
				return err
			}
			if err := tx.Where("question_id = ?", id).Delete(&models.QuizOption{}).Error; err != nil {
				return err
			}
		}
		// (Q-F) ถ้าไม่มีคำถามถูกลบ (id ไม่มีจริง) คืน not found
		res := tx.Delete(&models.QuizQuestion{}, id)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrQuizQuestionNotFound
		}
		return nil
	})
}

func (s *QuizService) AddOption(questionID uint, req dto.CreateQuizOptionReq) (*models.QuizOption, error) {
	var q models.QuizQuestion
	if err := s.db.First(&q, questionID).Error; err != nil {
		return nil, ErrQuizQuestionNotFound
	}

	opt := models.QuizOption{
		QuestionID:          questionID,
		Text:                req.Text,
		RecommendedCourseID: req.RecommendedCourseID,
	}

	if err := s.db.Create(&opt).Error; err != nil {
		return nil, errors.New("ไม่สามารถสร้างตัวเลือกได้")
	}
	return &opt, nil
}

// DeleteOption (Q-E) — ลบ mapping (quiz_option_courses) ของตัวเลือกก่อน แล้ว soft delete ตัวเลือก
// กัน orphan mapping ค้างใน DB (soft delete ไม่ trigger DB cascade)
func (s *QuizService) DeleteOption(optionID uint) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("option_id = ?", optionID).Delete(&models.QuizOptionCourse{}).Error; err != nil {
			return err
		}
		// (Q-F) ถ้าไม่มีตัวเลือกถูกลบ (id ไม่มีจริง) คืน not found
		res := tx.Delete(&models.QuizOption{}, optionID)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrQuizOptionNotFound
		}
		return nil
	})
}

func (s *QuizService) mapToResponses(questions []models.QuizQuestion) []dto.QuizQuestionResponse {
	var res []dto.QuizQuestionResponse
	for _, q := range questions {
		var opts []dto.QuizOptionResponse
		for _, o := range q.Options {
			mapped := make([]dto.OptionCourseResponse, 0, len(o.RecommendedCourses))
			for _, oc := range o.RecommendedCourses {
				// (Q-H) แสดงเฉพาะ mapping ที่คอร์สยัง active — ให้ตรงกับที่ scoring ใช้จริง
				// (คอร์สที่ถูกตั้ง inactive/draft ทีหลัง จะไม่โชว์ chip เพราะ scoring ก็ไม่นับ)
				if oc.Course == nil || oc.Course.Status != models.CourseStatusActive {
					continue
				}
				mapped = append(mapped, dto.OptionCourseResponse{
					ID:         oc.ID,
					CourseID:   oc.CourseID,
					CourseName: oc.Course.CourseName,
					Weight:     oc.Weight,
				})
			}
			opts = append(opts, dto.QuizOptionResponse{
				ID:                  o.ID,
				Text:                o.Text,
				RecommendedCourseID: o.RecommendedCourseID,
				RecommendedCourses:  mapped,
			})
		}
		res = append(res, dto.QuizQuestionResponse{
			ID:       q.ID,
			Text:     q.Text,
			Sequence: q.Sequence,
			IsActive: q.IsActive,
			Options:  opts,
		})
	}
	return res
}
