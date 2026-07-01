package dto

//เวลาใช้งานใช้อันนี้กับ controller
type CourseDTO struct {
	ID          uint               `json:"id"`
	CourseName  string             `json:"course_name"`
	Description string             `json:"description"`
	Status      string             `json:"status"`
	User        *CourseUserDTO     `json:"user"`
	Packages    []CoursePackageDTO `json:"packages"`
}

type CourseUserDTO struct {
	FirstName string `json:"firstname"`
	LastName  string `json:"lastname"`
	Email     string `json:"email"`
}

type CoursePackageDTO struct {
	SessionsCount uint    `json:"sessions_count"`
	HoursCount    uint    `json:"hours_count"`
	Price         float64 `json:"price"` 
}



// type CourseImageDTO struct {
// 	ID      uint   `json:"id"`
// 	FileURL string `json:"file_url"`
// }
