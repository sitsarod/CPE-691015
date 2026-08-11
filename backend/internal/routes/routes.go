package routes

import (
	"CPE-691015/internal/config"
	"CPE-691015/internal/controllers"
	"CPE-691015/internal/middlewares"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
)

// SetupRoutes registers all API routes for the application
func SetupRoutes(r *gin.Engine) {
	db := config.DB

	// Initialize services and controllers
	// แก้จาก NewCoachService() เป็น NewCoachService(db) เพราะ struct เปลี่ยนไปใช้ DI pattern แล้ว
	coachService := services.NewCoachService(db)
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
	paymentController := controllers.NewPaymentController(paymentService)

	billingService := services.NewBillingService(db)
	billingController := controllers.NewBillingController(billingService)

	userService := services.NewUserService(db)
	userController := controllers.NewUserController(userService)
	authService := services.NewAuthService(db)
	authController := controllers.NewAuthController(authService, userService)

	bankAccountService := services.NewBankAccountService(db)
	bankAccountController := controllers.NewBankAccountController(bankAccountService)

	// Cloudinary สำหรับเก็บไฟล์อัปโหลดบนคลาวด์ (nil = ยังไม่ตั้งค่า จะ fallback เก็บในเครื่อง)
	cloudinaryService := services.NewCloudinaryService()

	expenseService := services.NewExpenseService(db)
	expenseController := controllers.NewExpenseController(expenseService, cloudinaryService)

	r.Use(middlewares.CORSMiddleware())
	r.Static("/uploads", "./uploads")

	courseService := services.NewCourseService(db)
	courseController := controllers.NewCourseController(courseService)

	packageService := services.NewPackageService(db)
	packageController := controllers.NewPackageController(packageService)

	// Announcement system
	announcementService := services.NewAnnouncementService(db)
	announcementController := controllers.NewAnnouncementController(announcementService)

	// ระบบจัดการเนื้อหาหน้าแรกสาธารณะ (Landing Page CMS)
	homeContentService := services.NewHomeContentService(db)
	homeContentController := controllers.NewHomeContentController(homeContentService)

	// Automated Q&A system
	autoQAService := services.NewAutoQAService(db)
	autoQAController := controllers.NewAutoQAController(autoQAService)

	// ความยินยอมเก็บข้อมูลใบหน้า (PDPA)
	consentService := services.NewConsentService(db)
	consentController := controllers.NewConsentController(consentService)

	evaluationService := services.NewEvaluationService(db)
	evaluationController := controllers.NewEvaluationController(evaluationService, db)

	videoService := services.NewDetectedVideoService(db)
	videoController := controllers.NewVideoController(videoService, db)

	photoController := controllers.NewPhotoController(db)

	// ระบบรีวิว/ให้คะแนนคอร์สและโค้ช
	reviewService := services.NewReviewService(db)
	reviewController := controllers.NewReviewController(reviewService)

	r.Use(middlewares.CORSMiddleware())

	api := r.Group("/api")
	{

		authGroup := api.Group("/auth")
		{
			authGroup.POST("/login", authController.Login)
			authGroup.POST("/register", authController.Register)
			authGroup.POST("/refresh", authController.Refresh)
			authGroup.POST("/send-otp", authController.SendOTP)
			authGroup.POST("/verify-otp", authController.VerifyOTP)
		}
		publicUserGroup := api.Group("/users")
		{
			publicUserGroup.POST("/find", userController.FindAccount)
		}

		api.GET("/enrollments/courses", enrollmentController.GetAvailableCourses)

		publicCourseGroup := api.Group("/courses")
		{
			publicCourseGroup.GET("/", courseController.GetAllCourse)
			publicCourseGroup.GET("/:id", courseController.GetCourseByID)
		}

		protected := api.Group("")
		protected.Use(middlewares.AuthMiddleware())

		adminOnly := api.Group("")
		adminOnly.Use(middlewares.AuthMiddleware(), middlewares.RequireRole("admin"))

		// --- Coach ---
		// การดูรายละเอียด/เวลาว่าง/ตารางของ coach 1 คน อยู่ใต้ protected แต่ handler ตรวจสิทธิ์เอง
		// (coach เห็นเฉพาะของตัวเอง, admin เห็นได้ทุกคน) และ PATCH/PUT ก็ตรวจความเป็นเจ้าของกัน IDOR
		coachGroup := protected.Group("/coaches")
		{
			coachGroup.GET("/me", coachController.GetMyCoach)                                   // โค้ชที่ล็อกอินอยู่ resolve coach_id ของตัวเองจาก JWT
			coachGroup.GET("/me/reviews", reviewController.GetCoachReviews)                     // รีวิวจากลูกค้าที่รีวิวถึงโค้ชคนนี้ (resolve coach_id จาก JWT)
			coachGroup.GET("/:id", coachController.GetCoachByID)                                // เจ้าของ หรือ admin
			coachGroup.PATCH("/:id", coachController.UpdateCoach)                               // เจ้าของ หรือ admin (บาง field)
			coachGroup.GET("/:id/availability", coachAvailabilityController.GetAvailability)    // เจ้าของ หรือ admin
			coachGroup.PUT("/:id/availability", coachAvailabilityController.UpdateAvailability) // เจ้าของเท่านั้น (admin แก้ไม่ได้)
			coachGroup.GET("/:id/work-schedules", workScheduleController.GetSchedulesByCoach)   // เจ้าของ หรือ admin
			coachGroup.GET("/:id/expenses", expenseController.GetExpensesByCoach)               // เจ้าของ หรือ admin — ดูประวัติค่าจ้าง
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
			adminUserGroup.POST("/create", userController.CreateUserController)
			adminUserGroup.DELETE("/:id", userController.DeleteUserController)
		}

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

		// --- การลงทะเบียนใบหน้าตรงนักเรียน ---
		studentFacePhotoGroup := protected.Group("/students/face-photo")
		{
			studentFacePhotoGroup.POST("", photoController.UploadFacePhoto)
			studentFacePhotoGroup.GET("/me", photoController.GetMyPhotos)
			studentFacePhotoGroup.DELETE("/:id", photoController.DeleteFacePhoto)
		}

		// --- การประเมินนักเรียนโดยโค้ช ---
		evaluationGroup := protected.Group("/evaluations")
		{
			evaluationGroup.POST("", evaluationController.CreateEvaluation)
			evaluationGroup.GET("/me", evaluationController.GetMyEvaluations)
			evaluationGroup.GET("/student/:customer_id", evaluationController.GetStudentEvaluations)
		}

		// --- วิดีโอสแกนใบหน้า ---
		videoGroup := protected.Group("/videos")
		{
			videoGroup.POST("", videoController.UploadVideo)
			videoGroup.POST("/:raw_video_id/assign", videoController.ManuallyAssignStudents)
			videoGroup.GET("/me", videoController.GetMyDetectedVideos)
			videoGroup.GET("/:raw_video_id/students", videoController.GetVideoDetectedStudents)
		}

		enrollmentGroup := protected.Group("/enrollments")
		{
			enrollmentGroup.POST("/", enrollmentController.EnrollCourse)
			enrollmentGroup.GET("/customer/:id", enrollmentController.GetCustomerEnrollments)
		}

		adminEnrollmentReviewGroup := adminOnly.Group("/admin/enrollments")
		{
			adminEnrollmentReviewGroup.GET("/:id", enrollmentController.GetEnrollmentReview)
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
		}
		adminPaymentGroup := adminOnly.Group("/payments")
		{
			adminPaymentGroup.POST("/invoices/:id/confirm", paymentController.ConfirmPayment)
			adminPaymentGroup.PATCH("/invoices/:id/reject", paymentController.RejectPayment)
			adminPaymentGroup.PATCH("/invoices/:id/cancel", paymentController.CancelInvoice)
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
		api.GET("/announcements", announcementController.GetAllAnnouncements)
		api.GET("/announcements/:id", announcementController.GetAnnouncementByID)
		api.POST("/announcements/:id/view", announcementController.IncrementViewCount)
		api.GET("/announcements/categories", announcementController.GetAllCategories)

		// Automated Q&A Chat Session public endpoints
		api.POST("/chat-sessions", autoQAController.CreateChatSession)
		api.GET("/chat-sessions/:id", autoQAController.GetChatSessionByID)
		api.POST("/chat-sessions/:id/ask", autoQAController.AskQuestion)

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
		protectedChatSessionGroup := adminOnly.Group("/chat-sessions")
		{
			protectedChatSessionGroup.GET("/", autoQAController.GetAllChatSessions)
			protectedChatSessionGroup.PATCH("/:id", autoQAController.UpdateChatSession)
			protectedChatSessionGroup.DELETE("/:id", autoQAController.DeleteChatSession)
		}

		protectedAutoQAGroup := adminOnly.Group("/auto-qas")
		{
			protectedAutoQAGroup.GET("/", autoQAController.GetAllAutoQAs)
			protectedAutoQAGroup.GET("/:id", autoQAController.GetAutoQAByID)
			protectedAutoQAGroup.POST("/", autoQAController.CreateAutoQA)
			protectedAutoQAGroup.PATCH("/:id", autoQAController.UpdateAutoQA)
			protectedAutoQAGroup.DELETE("/:id", autoQAController.DeleteAutoQA)
		}
	}
}
