package routes

import (
	"strings"

	"CPE-691015/internal/config"
	"CPE-691015/internal/controllers"
	"CPE-691015/internal/middlewares"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
)

// SetupRoutes registers all API routes for the application
func SetupRoutes(r *gin.Engine) {
	db := config.DB

	// Cloudinary สำหรับเก็บไฟล์อัปโหลดบนคลาวด์ (nil = ยังไม่ตั้งค่า จะ fallback เก็บในเครื่อง)
	// ต้องสร้างก่อน service ที่ต้องใช้ลบไฟล์ตอนลบสมาชิก/โค้ช
	cloudinaryService := services.NewCloudinaryService()

	// Initialize services and controllers
	// แก้จาก NewCoachService() เป็น NewCoachService(db) เพราะ struct เปลี่ยนไปใช้ DI pattern แล้ว
	// ลบโค้ชต้องลบไฟล์รูปใบหน้าบนคลาวด์ตามไปด้วย จึงต้องรู้จัก Cloudinary
	coachService := services.NewCoachService(db).WithFaceStorage(cloudinaryService)
	coachController := controllers.NewCoachController(coachService)

	// เพิ่มใหม่: CoachAvailability และ WorkSchedule ที่ยังไม่เคย wire เข้า router
	coachAvailabilityService := services.NewCoachAvailabilityService(db)
	coachAvailabilityController := controllers.NewCoachAvailabilityController(coachAvailabilityService)

	workScheduleService := services.NewWorkScheduleService(db)
	workScheduleController := controllers.NewWorkScheduleController(workScheduleService)

	enrollmentService := services.NewEnrollmentService(db)
	enrollmentController := controllers.NewEnrollmentController(enrollmentService)

	slipOkService := services.NewSlipOkService()
	paymentService := services.NewPaymentService(db, slipOkService)
	// เมื่อ deploy ใช้ Cloudinary เก็บสลิป URL จะเป็น res.cloudinary.com/<cloud>/... (ไม่มี /uploads/)
	// จึงต้องบอก cloud name ให้ทั้งสอง service: payment รับ slip_url จาก Cloudinary,
	// และ slipOk ดึงรูปจาก Cloudinary มาตรวจ auto-verify ได้
	if cloudinaryService != nil {
		paymentService.WithCloudinaryCloudName(cloudinaryService.CloudName())
		slipOkService.WithCloudName(cloudinaryService.CloudName())
	}
	paymentController := controllers.NewPaymentController(paymentService)

	billingService := services.NewBillingService(db)
	billingController := controllers.NewBillingController(billingService)

	// การลบสมาชิกต้องลบไฟล์รูปใบหน้าบนคลาวด์ตามไปด้วย จึงต้องรู้จัก Cloudinary
	userService := services.NewUserService(db).WithFaceStorage(cloudinaryService)
	userController := controllers.NewUserController(userService)
	authService := services.NewAuthService(db)
	authController := controllers.NewAuthController(authService, userService)

	bankAccountService := services.NewBankAccountService(db)
	bankAccountController := controllers.NewBankAccountController(bankAccountService)

	expenseService := services.NewExpenseService(db)
	expenseController := controllers.NewExpenseController(expenseService, cloudinaryService)

	r.Use(middlewares.CORSMiddleware())
	// ไฟล์ที่ผู้ใช้อัปโหลด — เสิร์ฟพร้อม header กันเบราว์เซอร์เดาชนิดไฟล์เอง
	//
	// เป็นเกราะชั้นที่สอง ชั้นแรกคือ controllers.ValidateImageUpload/ValidateVideoUpload
	// ที่ปฏิเสธไฟล์ที่ไม่ใช่รูป/วิดีโอตั้งแต่ตอนอัปโหลด
	//
	// nosniff บังคับให้เบราว์เซอร์เชื่อ Content-Type ที่เราส่งไปเท่านั้น ไม่ไปเดาเอง
	// จากเนื้อไฟล์ ซึ่งเป็นพฤติกรรมที่ทำให้ไฟล์ที่ดูเหมือนรูปถูกรันเป็น HTML ได้
	//
	// CSP sandbox ตัดสิทธิ์ทุกอย่างของหน้าที่โหลดจาก path นี้ ต่อให้มีสคริปต์
	// หลุดเข้าไปได้จริง มันก็อ่าน localStorage ของเว็บหลัก (ที่เก็บ token) ไม่ได้
	r.Use(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/uploads/") {
			c.Header("X-Content-Type-Options", "nosniff")
			c.Header("Content-Security-Policy", "sandbox; default-src 'none'")
		}
		c.Next()
	})
	r.Static("/uploads", "./uploads")

	courseService := services.NewCourseService(db)
	courseController := controllers.NewCourseController(courseService)

	courtService := services.NewCourtService(db)
	courtController := controllers.NewCourtController(courtService)

	packageService := services.NewPackageService(db)
	packageController := controllers.NewPackageController(packageService)

	// Announcement system
	announcementService := services.NewAnnouncementService(db)
	announcementController := controllers.NewAnnouncementController(announcementService)

	// ระบบจัดการเนื้อหาหน้าแรกสาธารณะ (Landing Page CMS)
	homeContentService := services.NewHomeContentService(db)
	homeContentController := controllers.NewHomeContentController(homeContentService)

	// Automated Q&A system (ส่ง cloudinary เข้าไปด้วยสำหรับอัปโหลดไฟล์แนบในแชท)
	autoQAService := services.NewAutoQAService(db)
	autoQAController := controllers.NewAutoQAController(autoQAService, cloudinaryService)

	// ความยินยอมเก็บข้อมูลใบหน้า (PDPA)
	// ส่ง cloudinary เข้าไปเพราะการถอนความยินยอมต้องลบไฟล์รูปใบหน้าทิ้งให้หมดจริง
	consentService := services.NewConsentService(db, cloudinaryService)
	consentController := controllers.NewConsentController(consentService)

	evaluationService := services.NewEvaluationService(db)
	evaluationController := controllers.NewEvaluationController(evaluationService, db)

	// ไฟล์รูป/วิดีโอของระบบจำแนกนักเรียน (RawPhoto/RawVideo) — เก็บบน Cloudflare R2 ถ้าตั้งค่าไว้
	// (แยก account จาก Cloudinary ที่ระบบอื่นใช้ เพราะไฟล์กลุ่มนี้ถูกลบทิ้งเองใน 7 วัน) ไม่ตั้งค่า
	// R2 จะ fallback ไปเก็บดิสก์เครื่องแทน (ดู NewMediaStorage) เข้าถึงได้ผ่าน endpoint
	// ที่เช็คสิทธิ์แล้วเท่านั้นเสมอ ไม่ว่าจะเก็บที่ไหน (ดู GetVideoRaw/GetPhotoPostRaw)
	mediaStorage := services.NewMediaStorage()

	// ตัวแปลงรูปเป็น embedding (face-service) — ใช้ร่วมกันทั้งเช็คชื่อด้วยใบหน้าและจำแนกคนในรูปโพสต์
	faceEngine := services.NewHTTPFaceEngine()

	// จำแนกนักเรียนในรูป/วิดีโอที่โค้ชอัปโหลด — ใช้ roster ของ evaluationService เป็นกติกาว่าเทียบกับใครได้บ้าง
	faceTaggingService := services.NewFaceTaggingService(db, faceEngine, evaluationService)

	videoService := services.NewDetectedVideoService(db)
	videoController := controllers.NewVideoController(videoService, faceTaggingService, mediaStorage, db)

	photoPostService := services.NewDetectedPhotoService(db)
	photoPostController := controllers.NewPhotoPostController(photoPostService, videoService, faceTaggingService, mediaStorage, db)

	// การลงทะเบียนใบหน้า — ไฟล์เก็บบน Cloudinary โหมด authenticated เท่านั้น
	faceImageService := services.NewFaceImageService(db, cloudinaryService)
	faceImageController := controllers.NewFaceImageController(faceImageService)

	// เช็คชื่อเข้าเรียน — แอดมินเปิดรอบที่สนาม นักเรียนเอา QR ประจำตัวมาสแกน
	attendanceService := services.NewAttendanceService(db).
		WithFaceEngine(faceEngine)
	attendanceController := controllers.NewAttendanceController(attendanceService)

	// ระบบรีวิว/ให้คะแนนคอร์สและโค้ช
	reviewService := services.NewReviewService(db)
	reviewController := controllers.NewReviewController(reviewService)

	personalQRController := controllers.NewPersonalQRController(db)

	// ยืนยันการมาเรียนล่วงหน้า — โรงเรียนใช้ยอดนี้ตัดสินใจจองสนามเพิ่ม
	classConfirmationService := services.NewClassConfirmationService(db)
	classConfirmationController := controllers.NewClassConfirmationController(classConfirmationService)

	// ระบบแจ้งเตือน (per user) — หน้าเว็บ derive แล้ว sync ขึ้นมาเก็บ + จำสถานะอ่าน + ประวัติ
	notificationService := services.NewNotificationService(db)
	notificationController := controllers.NewNotificationController(notificationService)

	r.Use(middlewares.CORSMiddleware())
	r.OPTIONS("/*path", func(c *gin.Context) {
		c.AbortWithStatus(204)
	})

	api := r.Group("/api")
	{

		authGroup := api.Group("/auth")
		{
			// จำกัดจำนวนครั้งที่ยิงได้ต่อ IP — endpoint พวกนี้เปิดสาธารณะและรับรหัสผ่าน
			// ถ้าไม่จำกัด คนร้ายเดารหัสรัว ๆ ได้ไม่จำกัดครั้ง
			authGroup.POST("/login", middlewares.LoginRateLimit(), authController.Login)
			authGroup.POST("/register", middlewares.SensitiveRateLimit(), authController.Register)
			// /refresh ไม่ใส่ rate limit โดยตั้งใจ — refresh token เดาไม่ได้อยู่แล้ว
			// (ไม่ใช่รหัสผ่านที่คนตั้งเอง) จึงไม่ใช่เป้าของการเดารัว
			// และถ้าใส่แล้วโดนบล็อก SessionGuard จะตีความว่า session ตาย
			// แล้วเด้งผู้ใช้ที่ยังล็อกอินอยู่ดี ๆ ออกจากระบบ
			authGroup.POST("/refresh", authController.Refresh)
			// ⚠️ ตอนเปิด OTP กลับมาใช้ อย่าลืมใส่ SensitiveRateLimit() ด้วย
			// เพราะ OTP 6 หลักเดาสุ่มถูกได้ใน 1 ล้านครั้ง ถ้ายิงได้ไม่จำกัดคือเดาได้แน่นอน
			//authGroup.POST("/send-otp", middlewares.SensitiveRateLimit(), authController.SendOTP)
			//authGroup.POST("/verify-otp", middlewares.SensitiveRateLimit(), authController.VerifyOTP)
		}
		publicUserGroup := api.Group("/users")
		{
			// เปิดสาธารณะและตอบว่ามีบัญชีนี้อยู่จริงหรือไม่ ถ้ายิงได้ไม่จำกัด
			// จะกวาดรายชื่อสมาชิกทั้งระบบได้ด้วยการไล่ยิงเบอร์โทร
			publicUserGroup.POST("/find", middlewares.LoginRateLimit(), userController.FindAccount)
		}

		api.GET("/enrollments/courses", enrollmentController.GetAvailableCourses)

		publicCourseGroup := api.Group("/courses")
		{
			publicCourseGroup.GET("/", courseController.GetAllCourse)
			publicCourseGroup.GET("/:id", courseController.GetCourseByID)
		}

		protected := api.Group("")
		protected.Use(middlewares.AuthMiddleware(db))

		adminOnly := api.Group("")
		adminOnly.Use(middlewares.AuthMiddleware(db), middlewares.RequireRole("admin"))

		// --- Coach ---
		// การดูรายละเอียด/เวลาว่าง/ตารางของ coach 1 คน อยู่ใต้ protected แต่ handler ตรวจสิทธิ์เอง
		// (coach เห็นเฉพาะของตัวเอง, admin เห็นได้ทุกคน) และ PATCH/PUT ก็ตรวจความเป็นเจ้าของกัน IDOR
		coachGroup := protected.Group("/coaches")
		{
			coachGroup.GET("/me", coachController.GetMyCoach)                                                       // โค้ชที่ล็อกอินอยู่ resolve coach_id ของตัวเองจาก JWT
			coachGroup.GET("/me/reviews", reviewController.GetCoachReviews)                                         // รีวิวจากลูกค้าที่รีวิวถึงโค้ชคนนี้ (resolve coach_id จาก JWT)
			coachGroup.GET("/:id", coachController.GetCoachByID)                                                    // เจ้าของ หรือ admin
			coachGroup.PATCH("/:id", coachController.UpdateCoach)                                                   // เจ้าของ หรือ admin (บาง field)
			coachGroup.PATCH("/:id/bank", middlewares.SensitiveRateLimit(), coachController.UpdateCoachBankAccount) // เจ้าของเท่านั้น + ยืนยันรหัสผ่านซ้ำ + จำกัดจำนวนครั้ง
			coachGroup.GET("/:id/availability", coachAvailabilityController.GetAvailability)                        // เจ้าของ หรือ admin
			coachGroup.PUT("/:id/availability", coachAvailabilityController.UpdateAvailability)                     // เจ้าของเท่านั้น (admin แก้ไม่ได้)
			coachGroup.GET("/:id/work-schedules", workScheduleController.GetSchedulesByCoach)                       // เจ้าของ หรือ admin
			coachGroup.GET("/:id/taught-sessions", workScheduleController.GetTaughtSessionCount)                    // เจ้าของ หรือ admin — นับคาบที่เช็คชื่อปิดรอบจริง (คำนวณค่าจ้าง)
			coachGroup.GET("/:id/unresolved-sessions", workScheduleController.GetUnresolvedSessions)                // เจ้าของ หรือ admin — คาบที่สอนแล้วแต่ยังไม่มีรอบเช็คชื่อ (ยังไม่ได้เงิน)
			coachGroup.GET("/:id/expenses", expenseController.GetExpensesByCoach)                                   // เจ้าของ หรือ admin — ดูประวัติค่าจ้าง
			coachGroup.GET("/:id/payroll", expenseController.GetCoachPayroll)                                       // เจ้าของ หรือ admin — ยอดค่าจ้างที่ backend คำนวณให้ (แหล่งเดียว)
		}
		// เฉพาะ admin: ดูรายชื่อ coach ทั้งหมด, เพิ่ม/ลบ, แก้ระดับ/ค่าจ้าง
		adminCoachGroup := adminOnly.Group("/coaches")
		{
			adminCoachGroup.GET("", coachController.GetCoaches)
			adminCoachGroup.POST("", coachController.CreateCoach)
			adminCoachGroup.DELETE("/:id", coachController.DeleteCoach)
			adminCoachGroup.PATCH("/:id/level", coachController.AdminUpdateCoach)
		}

		// --- Work schedule ---
		// ปฏิทินรวมของทุก coach เป็นของ admin (coach ดูของตัวเองผ่าน /coaches/:id/work-schedules ด้านบน)
		adminWorkScheduleGroup := adminOnly.Group("/work-schedules")
		{
			adminWorkScheduleGroup.GET("", workScheduleController.GetSchedules)
			adminWorkScheduleGroup.GET("/:id", workScheduleController.GetScheduleByID)
			adminWorkScheduleGroup.POST("", workScheduleController.CreateSchedule)
			adminWorkScheduleGroup.PATCH("/:id", workScheduleController.UpdateSchedule)
			adminWorkScheduleGroup.DELETE("/:id", workScheduleController.DeleteSchedule)
		}

		// ปฏิทินคาบเรียนรายสัปดาห์ (session-centric) — แยก path ออกจาก /work-schedules/:id
		// เพื่อไม่ให้ route ชนกับ param :id
		adminOnly.GET("/schedule-sessions", workScheduleController.GetWeekSessions)

		// เวลาว่างของโค้ชทุกคนในครั้งเดียว — ใช้ path แยก (/coach-availabilities) กัน route ชนกับ /coaches/:id
		adminOnly.GET("/coach-availabilities", coachAvailabilityController.GetAllAvailabilities)

		// --- จัดการสนาม (admin) ---
		adminCourtGroup := adminOnly.Group("/courts")
		{
			adminCourtGroup.GET("", courtController.GetCourts)
			adminCourtGroup.POST("", courtController.CreateCourt)
			adminCourtGroup.PATCH("/:id", courtController.UpdateCourt)
			adminCourtGroup.DELETE("/:id", courtController.DeleteCourt)
		}

		userGroup := protected.Group("/users")
		{
			userGroup.GET("/:id", userController.GetUserProfileController)
			userGroup.PATCH("/:id", userController.UpdateUserController)
		}
		adminUserGroup := adminOnly.Group("/admin")
		{
			adminUserGroup.GET("/users", userController.GetAllUsersController)
			adminUserGroup.GET("/role", userController.GetUserByRoleController)
			adminUserGroup.GET("/students", userController.GetActiveStudentsController)
			// สร้างสมาชิกพร้อมโปรไฟล์ตามบทบาทในทรานแซกชันเดียว — ใช้เส้นนี้เป็นหลัก
			adminUserGroup.POST("/users", userController.AdminCreateUserController)

			// ดูรายละเอียดสมาชิกแบบเต็ม (รวมโปรไฟล์ตามบทบาท)
			adminUserGroup.GET("/users/:id", userController.AdminGetUserDetailController)

			// แอดมินแก้ข้อมูลตัวตน/การเงินที่เจ้าตัวแก้เองไม่ได้ (หลังตรวจหลักฐาน)
			adminUserGroup.PATCH("/users/:id", userController.AdminUpdateUserController)

			// เส้นเดิม: สร้างแค่บัญชีเข้าระบบ ไม่มีโปรไฟล์
			// เก็บไว้ชั่วคราวเพื่อไม่ให้หน้าเดิมพัง จะลบเมื่อหน้าบ้านย้ายไปใช้ /users ครบแล้ว
			adminUserGroup.POST("/create", userController.CreateUserController)
			adminUserGroup.DELETE("/:id", userController.DeleteUserController)
		}

		// --- ระบบแจ้งเตือน ---
		// ทุกเส้นอ้างตัวตนจาก JWT (userID) จึงเห็น/แก้ได้เฉพาะแจ้งเตือนของตัวเอง
		notifGroup := protected.Group("/notifications")
		{
			notifGroup.GET("", notificationController.List)
			// /sync ยังไม่ถูกเรียกใช้ (ระบบเป็น event-driven) — เก็บไว้ใช้อนาคตกับแจ้งเตือน
			// ที่ derive ฝั่ง client เช่น เบราว์เซอร์ไม่รองรับกล้อง ดู NotificationService.Sync
			notifGroup.POST("/sync", notificationController.Sync)
			notifGroup.POST("/read-all", notificationController.MarkAllRead)
			notifGroup.PATCH("/:id/read", notificationController.MarkRead)
			notifGroup.DELETE("", notificationController.Clear)
		}

		// SSE stream แจ้งเตือนเรียลไทม์ — auth ผ่าน query token เอง (EventSource ตั้ง header ไม่ได้)
		// จึงอยู่นอก protected group ที่ใช้ AuthMiddleware
		api.GET("/notifications/stream", notificationController.Stream)

		// --- QR ประจำตัว ---
		// อ้างตัวตนจาก JWT อย่างเดียว ไม่มี path param จึงดึง QR ของคนอื่นไม่ได้
		// ใช้ได้ทั้งนักเรียนและโค้ช (แอดมินจะได้ 404 เพราะไม่มี QR ประจำตัว)
		protected.GET("/me/qr", personalQRController.GetMyQR)

		// --- ความยินยอมเก็บข้อมูลใบหน้า (PDPA) ---
		// ทุกเส้นอ้างตัวตนจาก JWT อย่างเดียว ไม่มี path param และไม่รับ customer_id จาก body
		// จึงบันทึก/ถอนความยินยอมแทนคนอื่นไม่ได้ (ไม่ต้องใช้ CheckIDOR)
		consentGroup := protected.Group("/consents/face")
		{
			consentGroup.GET("/me", consentController.GetMyConsent)
			consentGroup.POST("", consentController.RecordConsent)
			consentGroup.DELETE("", consentController.WithdrawConsent)
		}

		// แอดมินดูประวัติความยินยอมย้อนหลัง (ใช้พิสูจน์ความชอบด้วยกฎหมายตาม PDPA)
		adminConsentGroup := adminOnly.Group("/admin/consents/face")
		{
			adminConsentGroup.GET("", consentController.GetConsentHistory)
		}

		// --- การลงทะเบียนใบหน้าของนักเรียน ---
		// แทนกลุ่ม /students/face-photo เดิมที่ถูกลบพร้อม photo_controller.go
		// (ของเดิมสุ่ม embedding และเก็บรูปใบหน้าไว้ในโฟลเดอร์สาธารณะ)
		//
		// ทุกเส้นอ้างตัวตนจาก JWT ส่วนเส้นที่มี :id ตรวจความเป็นเจ้าของในชั้น service
		// (FaceImageService.findOwned) จึงไม่ต้องใช้ CheckIDOR ที่นี่
		faceImageGroup := protected.Group("/face-images")
		{
			faceImageGroup.POST("", faceImageController.UploadFaceImage)
			faceImageGroup.GET("/me", faceImageController.GetMyFaceImages)
			faceImageGroup.GET("/:id/raw", faceImageController.GetFaceImageRaw)
			faceImageGroup.DELETE("/:id", faceImageController.DeleteFaceImage)
		}

		// แอดมินตรวจอนุมัติรูปใบหน้า — ดูรูปจริงผ่าน /face-images/:id/raw ที่ให้สิทธิ์ admin ไว้แล้ว
		adminFaceImageGroup := adminOnly.Group("/admin/face-images")
		{
			adminFaceImageGroup.GET("", faceImageController.ListFaceImagesForAdmin)
			adminFaceImageGroup.PATCH("/:id/review", faceImageController.ReviewFaceImage)
		}

		// --- การประเมินนักเรียนโดยโค้ช ---
		evaluationGroup := protected.Group("/evaluations")
		{
			evaluationGroup.POST("", evaluationController.CreateEvaluation)
			evaluationGroup.GET("/students", evaluationController.GetMyStudents) // โค้ช: รายชื่อนักเรียนของตัวเอง (?course_id= กรองเฉพาะคอร์ส)
			evaluationGroup.GET("/courses", evaluationController.GetMyCourses)   // โค้ช: รายชื่อคอร์สที่ตัวเองสอน
			evaluationGroup.GET("/me", evaluationController.GetMyEvaluations)
			evaluationGroup.GET("/me/given", evaluationController.GetMyGivenEvaluations) // โค้ช: ประวัติการประเมินที่ตัวเองให้ไว้
			evaluationGroup.GET("/student/:customer_id", evaluationController.GetStudentEvaluations)
		}

		// --- วิดีโอสแกนใบหน้า ---
		videoGroup := protected.Group("/videos")
		{
			videoGroup.POST("", videoController.UploadVideo)
			videoGroup.POST("/:raw_video_id/assign", videoController.ManuallyAssignStudents)
			videoGroup.GET("/me", videoController.GetMyDetectedVideos)
			videoGroup.GET("/:raw_video_id/students", videoController.GetVideoDetectedStudents)
			videoGroup.GET("/:raw_video_id/raw", videoController.GetVideoRaw)
		}

		// --- รูปโพสต์ที่โค้ชอัปโหลด (อาจมีนักเรียนหลายคนอยู่ในรูปเดียว) ---
		photoPostGroup := protected.Group("/photo-posts")
		{
			photoPostGroup.POST("", photoPostController.UploadPhotoPost)
			photoPostGroup.POST("/:raw_photo_id/assign", photoPostController.AssignStudentsToPhoto)
			photoPostGroup.GET("/:raw_photo_id/students", photoPostController.GetPhotoDetectedStudents)
			photoPostGroup.GET("/:raw_photo_id/raw", photoPostController.GetPhotoPostRaw)
		}

		// --- โพสต์ (รูป+วิดีโอ) รวมของนักเรียนที่ล็อกอินอยู่ — ใช้กับแท็บ Posts ในโปรไฟล์ ---
		studentPostsGroup := protected.Group("/students/posts")
		{
			studentPostsGroup.GET("/me", photoPostController.GetMyPosts)
			studentPostsGroup.DELETE("/:type/:raw_id", photoPostController.DeleteMyPost)
		}

		enrollmentGroup := protected.Group("/enrollments")
		{
			enrollmentGroup.POST("/", enrollmentController.EnrollCourse)
			enrollmentGroup.GET("/customer/:id", enrollmentController.GetCustomerEnrollments)
			// นักเรียนถอนใบสมัครของตัวเอง เฉพาะใบที่ยังรออนุมัติ
			// :id เป็นเลขเรียงที่เดาต่อได้ service จึงเทียบเจ้าของจาก JWT ก่อนเสมอ
			enrollmentGroup.PATCH("/:id/cancel", enrollmentController.CancelMyEnrollment)
		}

		// --- ยืนยันการมาเรียนล่วงหน้า ---
		// อ้างตัวตนจาก JWT อย่างเดียว ไม่รับ customer_id จาก body จึงตอบแทนคนอื่นไม่ได้
		classConfirmGroup := protected.Group("/class-confirmations")
		{
			classConfirmGroup.GET("/upcoming", classConfirmationController.GetMyUpcoming)
			classConfirmGroup.PUT("", classConfirmationController.Confirm)
			classConfirmGroup.DELETE("", classConfirmationController.Cancel)
		}

		// --- เช็คชื่อเข้าเรียน ---
		//
		// ทุกเส้นเป็น adminOnly เพราะเครื่องที่สนามล็อกอินด้วยบัญชีแอดมิน
		// ตัวตนของนักเรียนมาจาก QR ใน body ไม่ใช่จาก JWT — ต่างจากเส้นทางอื่นในระบบ
		attendanceGroup := adminOnly.Group("/attendance")
		{
			attendanceGroup.GET("/openable", attendanceController.GetOpenablePackages)
			attendanceGroup.GET("/history", attendanceController.GetHistory)
			attendanceGroup.GET("/coach-history", attendanceController.GetCoachHistory)

			// คาบที่ผ่านไปแล้วแต่ไม่เคยมีรอบเช็คชื่อ = ค่าจ้างที่ยังไม่ถูกนับให้โค้ช
			// resolve สร้างรอบย้อนหลัง + บันทึกว่าใครมาสอน (ดู coach_missed_class.go)
			attendanceGroup.GET("/missed-classes", attendanceController.GetMissedClasses)
			attendanceGroup.POST("/missed-classes/resolve", attendanceController.ResolveMissedClass)

			// รอบที่เปิดค้างอยู่ — หน้าเช็คชื่อเรียกคู่กับ /openable ใน Promise.all
			// ขาดเส้นนี้ = 404 แล้วล้มทั้งชุด หน้าโหลดไม่ขึ้นเลย
			attendanceGroup.GET("/sessions", attendanceController.GetOpenSessions)
			attendanceGroup.POST("/sessions", attendanceController.OpenSession)
			attendanceGroup.GET("/sessions/:id", attendanceController.GetSession)
			// สแกนสองจังหวะ: lookup ไม่เขียนอะไร · check-in บันทึกและหักโควตา
			attendanceGroup.POST("/sessions/:id/lookup", attendanceController.Lookup)
			attendanceGroup.POST("/sessions/:id/check-in", attendanceController.CheckIn)
			// สแกนใบหน้า — สองจังหวะเหมือน QR แต่รับรูปเป็น multipart
			// จังหวะ 2 รับรูปใหม่เสมอ ไม่รับ enrollment_id จาก lookup
			attendanceGroup.POST("/sessions/:id/face-lookup", attendanceController.FaceLookup)
			attendanceGroup.POST("/sessions/:id/face-check-in", attendanceController.FaceCheckIn)
			attendanceGroup.POST("/sessions/:id/manual", attendanceController.ManualCheckIn)
			attendanceGroup.POST("/sessions/:id/coach-manual", attendanceController.ManualCoachCheckIn)
			attendanceGroup.PATCH("/sessions/:id/close", attendanceController.CloseSession)

			attendanceGroup.PATCH("/records/:id", attendanceController.UpdateStatus)
			attendanceGroup.PATCH("/coach-records/:id", attendanceController.UpdateCoachAttendanceStatus)
		}

		// ยอดคนที่ตอบว่าจะมาเรียน "วันนี้" — ใช้ตัดสินใจจองสนามเพิ่ม
		adminOnly.GET("/admin/class-confirmations/headcount", classConfirmationController.GetHeadcounts)
		// รายชื่อรายคาบ — กดจากยอดสรุปเข้ามาดูว่าใครตอบว่ามา/ไม่มา/ยังไม่ตอบ
		adminOnly.GET("/admin/class-confirmations/roster", classConfirmationController.GetClassRoster)

		adminEnrollmentReviewGroup := adminOnly.Group("/admin/enrollments")
		{
			adminEnrollmentReviewGroup.GET("/:id", enrollmentController.GetEnrollmentReview)
			// ปฏิเสธคำขอ — ต่างจาก DELETE ตรงที่ไม่ลบทิ้ง แต่เก็บเหตุผลและคนตัดสินใจไว้
			adminEnrollmentReviewGroup.PATCH("/:id/reject", enrollmentController.RejectEnrollment)
			adminEnrollmentReviewGroup.POST("/:id/extend", enrollmentController.ExtendEnrollment)
			adminEnrollmentReviewGroup.GET("/:id/extensions", enrollmentController.GetEnrollmentExtensions)
		}

		adminEnrollmentGroup := adminOnly.Group("/enrollments")
		{
			adminEnrollmentGroup.GET("/", enrollmentController.GetAllEnrollments)
			adminEnrollmentGroup.PATCH("/:id", enrollmentController.UpdateEnrollment)
			adminEnrollmentGroup.PATCH("/:id/approve", enrollmentController.ApproveEnrollment)
			adminEnrollmentGroup.DELETE("/:id", enrollmentController.DeleteEnrollment)
		}

		paymentGroup := protected.Group("/payments")
		{
			paymentGroup.POST("/invoices", paymentController.CreateInvoice)
			paymentGroup.POST("/invoices/:id/slip", paymentController.UploadSlip)
			paymentGroup.GET("/invoices/customer/:id", paymentController.GetCustomerInvoices)
			// ยกเลิกใบแจ้งหนี้ที่ยังรอดำเนินการ — เจ้าของยกเลิกของตัวเองได้ (admin ยกเลิกได้ทุกใบ)
			// service ตรวจความเป็นเจ้าของกัน IDOR เอง จึงอยู่ใต้ protected ไม่ใช่ adminOnly
			// ปิด dead-end เดิม: ลูกค้าสร้างใบแล้วเปลี่ยนใจ ต้องยกเลิกเองได้ ไม่งั้นบิลค้างสร้างใบใหม่ไม่ได้
			paymentGroup.PATCH("/invoices/:id/cancel", paymentController.CancelInvoice)
		}
		adminPaymentGroup := adminOnly.Group("/payments")
		{
			adminPaymentGroup.POST("/invoices/:id/confirm", paymentController.ConfirmPayment)
			adminPaymentGroup.PATCH("/invoices/:id/reject", paymentController.RejectPayment)
		}

		billingGroup := protected.Group("/billings")
		{
			billingGroup.GET("/:id", billingController.GetBillingByID)
			billingGroup.GET("/customer/:id", billingController.GetCustomerBillings)
		}
		adminBillingGroup := adminOnly.Group("/billings")
		{
			adminBillingGroup.GET("/", billingController.GetAllBillings)
			adminBillingGroup.POST("/", billingController.CreateBilling)
			adminBillingGroup.POST("/split", billingController.CreateSplitBilling)
			adminBillingGroup.PATCH("/:id", billingController.UpdateBilling)
			adminBillingGroup.DELETE("/:id", billingController.DeleteBilling)
		}

		protected.GET("/bank-accounts/active", bankAccountController.GetActiveBankAccounts)

		bankAccountsGroup := adminOnly.Group("/bank-accounts")
		{
			bankAccountsGroup.GET("/", bankAccountController.GetAllBankAccounts)
			bankAccountsGroup.POST("/", bankAccountController.CreateBankAccount)
			bankAccountsGroup.PATCH("/:id", bankAccountController.UpdateBankAccount)
			bankAccountsGroup.PATCH("/:id/toggle", bankAccountController.ToggleBankAccount)
			bankAccountsGroup.DELETE("/:id", bankAccountController.DeleteBankAccount)
		}

		protected.POST("/upload", expenseController.UploadFileHandler)

		expensesGroup := adminOnly.Group("/expenses")
		{
			expensesGroup.GET("/", expenseController.GetAllExpenses)
			expensesGroup.POST("/", expenseController.CreateExpense)
			expensesGroup.PATCH("/:id", expenseController.UpdateExpense)
			expensesGroup.DELETE("/:id", expenseController.DeleteExpense)
		}

		protectedCourseGroup := adminOnly.Group("/courses")
		{
			protectedCourseGroup.POST("/", courseController.CreateCourse)
			protectedCourseGroup.PATCH("/:id", courseController.UpdateCourse)
			protectedCourseGroup.DELETE("/:id", courseController.DeleteCourse)
		}

		// (C1) เส้นทางเฉพาะแอดมินสำหรับดูคอร์สทุกสถานะ (รวม draft/inactive)
		// แยก path เป็น /admin/courses เพื่อไม่ชนกับ GET /courses ที่เป็น public (active-only)
		adminCourseGroup := adminOnly.Group("/admin/courses")
		{
			adminCourseGroup.GET("", courseController.GetAllCourseAdmin)
			adminCourseGroup.GET("/:id", courseController.GetCourseByIDAdmin)
		}

		packageGroup := adminOnly.Group("/packages")
		{
			packageGroup.POST("/", packageController.CreatePackage)
			packageGroup.PATCH("/:id", packageController.UpdatePackage)
			packageGroup.DELETE("/:id", packageController.DeletePackage)
		}

		// --- ระบบจัดการเนื้อหาหน้าแรกสาธารณะ ---
		// Public: หน้าแรกดึงเนื้อหาทั้งก้อน (content + active slides + featured coaches)
		api.GET("/home-content", homeContentController.GetPublicHome)
		api.GET("/home-content/coaches", homeContentController.GetPublicCoaches)

		// Admin: จัดการเนื้อหา, รูปสไลด์, และเลือกโค้ชที่แสดงหน้าแรก
		adminHomeGroup := adminOnly.Group("/admin/home-content")
		{
			adminHomeGroup.GET("", homeContentController.GetHomeContent)
			adminHomeGroup.PATCH("", homeContentController.UpdateHomeContent)

			adminHomeGroup.GET("/slides", homeContentController.GetSlides)
			adminHomeGroup.POST("/slides", homeContentController.CreateSlide)
			adminHomeGroup.PATCH("/reorder-slides", homeContentController.ReorderSlides)
			adminHomeGroup.PATCH("/slides/:id", homeContentController.UpdateSlide)
			adminHomeGroup.DELETE("/slides/:id", homeContentController.DeleteSlide)

			adminHomeGroup.GET("/coaches", homeContentController.GetAllCoachesForHome)
			adminHomeGroup.PATCH("/coaches/:id/feature", homeContentController.SetCoachFeature)
		}

		// Announcement endpoints
		// สาธารณะ: คืนเฉพาะประกาศที่กำลังแสดงผล (active) เท่านั้น ไม่โชว์ที่หมดอายุ/ยังไม่เริ่ม
		api.GET("/announcements", announcementController.GetActiveAnnouncements)
		api.GET("/announcements/:id", announcementController.GetAnnouncementByID)
		api.POST("/announcements/:id/view", announcementController.IncrementViewCount)
		api.GET("/announcements/categories", announcementController.GetAllCategories)
		// แกลเลอรีรูปภาพทั้งหมดสำหรับผู้เยี่ยมชม (รวมประกาศเก่าที่หมดอายุแล้ว) — ปุ่ม "ดูรูปทั้งหมด" บนหน้าแรก
		api.GET("/announcements/gallery", announcementController.GetGuestGallery)

		// แอดมิน: ดูประกาศทั้งหมด (รวมที่หมดอายุ/ยังไม่เริ่ม) สำหรับหน้าจัดการ
		adminOnly.GET("/admin/announcements", announcementController.GetAllAnnouncements)

		// Automated Q&A Chat Session public endpoints
		// /auto-qas/public ส่งรูปแบบย่อ (ไม่มีคีย์เวิร์ด/mode) กันเปิดเผยกลไกหลังบ้าน
		api.GET("/auto-qas/public", autoQAController.GetPublicAutoQAs)
		// สร้าง session และถามคำถามเป็น endpoint สาธารณะที่เขียน DB — ใส่ rate limit กันสแปม
		api.POST("/chat-sessions", middlewares.PublicChatRateLimit(), autoQAController.CreateChatSession)
		api.GET("/chat-sessions/:id", autoQAController.GetChatSessionByID)
		// SSE — แจ้งสัญญาณ "มีข้อความใหม่" แบบเรียลไทม์ให้ผู้เยี่ยมชม/ลูกค้าที่เปิดกล่องแชทอยู่
		// (rate limit เดียวกับ endpoint แชทสาธารณะอื่นๆ กันเปิด connection รัวๆ)
		api.GET("/chat-sessions/:id/stream", middlewares.PublicChatRateLimit(), autoQAController.StreamChatSession)
		api.POST("/chat-sessions/:id/ask", middlewares.PublicChatRateLimit(), autoQAController.AskQuestion)
		// ลูกค้าแก้ไข/ลบข้อความของตัวเองในห้องแชท (สาธารณะ + rate limit)
		api.PATCH("/chat-sessions/:id/messages/:msgId", middlewares.PublicChatRateLimit(), autoQAController.EditMessage)
		api.DELETE("/chat-sessions/:id/messages/:msgId", middlewares.PublicChatRateLimit(), autoQAController.DeleteMessage)
		// อัปโหลดไฟล์แนบในแชท (รูป/PDF) — สาธารณะ + rate limit เพราะ guest ก็ต้องแนบได้
		api.POST("/chat-uploads", middlewares.PublicChatRateLimit(), autoQAController.UploadChatAttachment)

		// ประกาศการเก็บข้อมูลใบหน้า — public เพราะต้องอ่านได้ก่อนตัดสินใจยินยอม
		api.GET("/consents/face/policy", consentController.GetPolicy)

		// --- ระบบรีวิว/ให้คะแนน ---
		// รีวิวที่ถูกเลือกให้แสดงหน้าแรก เป็น public (ไม่ต้องล็อกอินก็เห็นได้)
		api.GET("/reviews/featured", reviewController.GetFeaturedReviews)

		// ลูกค้าส่งรีวิว/ดูรีวิวของตัวเอง (customer_id ผูกกับ JWT กันรีวิวแทนคนอื่น)
		reviewGroup := protected.Group("/reviews")
		{
			reviewGroup.POST("", reviewController.CreateReview)
			reviewGroup.GET("/me", reviewController.GetMyReviews)
			// รายชื่อโค้ชในคอร์ส สำหรับให้ลูกค้าเลือกรีวิวโค้ช
			reviewGroup.GET("/courses/:course_id/coaches", reviewController.GetCourseCoaches)
		}

		// แอดมิน: ดูรีวิวทั้งหมด, เลือกแสดงหน้าแรก, แก้ไข, ลบ
		adminReviewGroup := adminOnly.Group("/admin/reviews")
		{
			adminReviewGroup.GET("", reviewController.GetAllReviews)
			adminReviewGroup.PATCH("/:id", reviewController.UpdateReview)
			adminReviewGroup.PATCH("/:id/feature", reviewController.FeatureReview)
			adminReviewGroup.DELETE("/:id", reviewController.DeleteReview)
		}

		protectedAnnouncementGroup := adminOnly.Group("/announcements")
		{
			protectedAnnouncementGroup.POST("", announcementController.CreateAnnouncement)
			protectedAnnouncementGroup.PATCH("/:id", announcementController.UpdateAnnouncement)
			protectedAnnouncementGroup.DELETE("/:id", announcementController.DeleteAnnouncement)
			protectedAnnouncementGroup.POST("/categories", announcementController.CreateCategory)
			protectedAnnouncementGroup.PATCH("/categories/:id", announcementController.UpdateCategory)
			protectedAnnouncementGroup.DELETE("/categories/:id", announcementController.DeleteCategory)
		}

		// Automated Q&A Chat Session and Knowledge Base protected endpoints
		adminOnly.GET("/admin/chat-sessions", autoQAController.GetAllChatSessions)
		adminOnly.PATCH("/admin/chat-sessions/:id", autoQAController.UpdateChatSession)
		adminOnly.DELETE("/admin/chat-sessions/:id", autoQAController.DeleteChatSession)
		adminOnly.POST("/admin/chat-sessions/:id/reply", autoQAController.AdminReply)

		protectedAutoQAGroup := adminOnly.Group("/admin/auto-qas")
		{
			protectedAutoQAGroup.GET("", autoQAController.GetAllAutoQAs)
			protectedAutoQAGroup.GET("/:id", autoQAController.GetAutoQAByID)
			protectedAutoQAGroup.POST("", autoQAController.CreateAutoQA)
			protectedAutoQAGroup.PATCH("/:id", autoQAController.UpdateAutoQA)
			protectedAutoQAGroup.DELETE("/:id", autoQAController.DeleteAutoQA)
		}
	}
}
