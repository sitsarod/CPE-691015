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

	cloudinaryService := services.NewCloudinaryService()

	coachService := services.NewCoachService(db).WithFaceStorage(cloudinaryService)
	coachController := controllers.NewCoachController(coachService)

	coachAvailabilityService := services.NewCoachAvailabilityService(db)
	coachAvailabilityController := controllers.NewCoachAvailabilityController(coachAvailabilityService)

	workScheduleService := services.NewWorkScheduleService(db)
	workScheduleController := controllers.NewWorkScheduleController(workScheduleService)

	enrollmentService := services.NewEnrollmentService(db)
	enrollmentController := controllers.NewEnrollmentController(enrollmentService)

	slipOkService := services.NewSlipOkService()
	paymentService := services.NewPaymentService(db, slipOkService)
	if cloudinaryService != nil {
		paymentService.WithCloudinaryCloudName(cloudinaryService.CloudName())
		slipOkService.WithCloudName(cloudinaryService.CloudName())
	}
	paymentController := controllers.NewPaymentController(paymentService)

	billingService := services.NewBillingService(db)
	billingController := controllers.NewBillingController(billingService)

	userService := services.NewUserService(db).WithFaceStorage(cloudinaryService)
	userController := controllers.NewUserController(userService)
	authService := services.NewAuthService(db)
	authController := controllers.NewAuthController(authService, userService)

	bankAccountService := services.NewBankAccountService(db)
	bankAccountController := controllers.NewBankAccountController(bankAccountService)

	expenseService := services.NewExpenseService(db)
	expenseController := controllers.NewExpenseController(expenseService, cloudinaryService)

	r.Use(middlewares.CORSMiddleware())
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

	announcementService := services.NewAnnouncementService(db)
	announcementController := controllers.NewAnnouncementController(announcementService)

	homeContentService := services.NewHomeContentService(db)
	homeContentController := controllers.NewHomeContentController(homeContentService)

	autoQAService := services.NewAutoQAService(db)
	autoQAController := controllers.NewAutoQAController(autoQAService, cloudinaryService)

	consentService := services.NewConsentService(db, cloudinaryService)
	consentController := controllers.NewConsentController(consentService)

	evaluationService := services.NewEvaluationService(db)
	evaluationController := controllers.NewEvaluationController(evaluationService, db)

	mediaStorage := services.NewMediaStorage()

	faceEngine := services.NewHTTPFaceEngine()

	faceTaggingService := services.NewFaceTaggingService(db, faceEngine, evaluationService)

	videoService := services.NewDetectedVideoService(db)
	videoController := controllers.NewVideoController(videoService, faceTaggingService, mediaStorage, db)

	photoPostService := services.NewDetectedPhotoService(db)
	photoPostController := controllers.NewPhotoPostController(photoPostService, videoService, faceTaggingService, mediaStorage, db)

	faceImageService := services.NewFaceImageService(db, cloudinaryService)
	faceImageController := controllers.NewFaceImageController(faceImageService)

	attendanceService := services.NewAttendanceService(db).
		WithFaceEngine(faceEngine)
	attendanceController := controllers.NewAttendanceController(attendanceService)

	reviewService := services.NewReviewService(db)
	reviewController := controllers.NewReviewController(reviewService)

	personalQRController := controllers.NewPersonalQRController(db)

	classConfirmationService := services.NewClassConfirmationService(db)
	classConfirmationController := controllers.NewClassConfirmationController(classConfirmationService)

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
			authGroup.POST("/login", middlewares.LoginRateLimit(), authController.Login)
			authGroup.POST("/register", middlewares.SensitiveRateLimit(), authController.Register)
			authGroup.POST("/refresh", authController.Refresh)
		}
		publicUserGroup := api.Group("/users")
		{
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
		adminCoachGroup := adminOnly.Group("/coaches")
		{
			adminCoachGroup.GET("", coachController.GetCoaches)
			adminCoachGroup.POST("", coachController.CreateCoach)
			adminCoachGroup.DELETE("/:id", coachController.DeleteCoach)
			adminCoachGroup.PATCH("/:id/level", coachController.AdminUpdateCoach)
		}

		adminWorkScheduleGroup := adminOnly.Group("/work-schedules")
		{
			adminWorkScheduleGroup.GET("", workScheduleController.GetSchedules)
			adminWorkScheduleGroup.GET("/:id", workScheduleController.GetScheduleByID)
			adminWorkScheduleGroup.POST("", workScheduleController.CreateSchedule)
			adminWorkScheduleGroup.PATCH("/:id", workScheduleController.UpdateSchedule)
			adminWorkScheduleGroup.DELETE("/:id", workScheduleController.DeleteSchedule)
		}

		adminOnly.GET("/schedule-sessions", workScheduleController.GetWeekSessions)

		adminOnly.GET("/coach-availabilities", coachAvailabilityController.GetAllAvailabilities)

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
			adminUserGroup.POST("/users", userController.AdminCreateUserController)

			adminUserGroup.GET("/users/:id", userController.AdminGetUserDetailController)

			adminUserGroup.PATCH("/users/:id", userController.AdminUpdateUserController)

			adminUserGroup.POST("/create", userController.CreateUserController)
			adminUserGroup.DELETE("/:id", userController.DeleteUserController)
		}

		notifGroup := protected.Group("/notifications")
		{
			notifGroup.GET("", notificationController.List)
			notifGroup.POST("/sync", notificationController.Sync)
			notifGroup.POST("/read-all", notificationController.MarkAllRead)
			notifGroup.PATCH("/:id/read", notificationController.MarkRead)
			notifGroup.DELETE("", notificationController.Clear)
		}

		api.GET("/notifications/stream", notificationController.Stream)

		protected.GET("/me/qr", personalQRController.GetMyQR)

		consentGroup := protected.Group("/consents/face")
		{
			consentGroup.GET("/me", consentController.GetMyConsent)
			consentGroup.POST("", consentController.RecordConsent)
			consentGroup.DELETE("", consentController.WithdrawConsent)
		}

		adminConsentGroup := adminOnly.Group("/admin/consents/face")
		{
			adminConsentGroup.GET("", consentController.GetConsentHistory)
		}

		faceImageGroup := protected.Group("/face-images")
		{
			faceImageGroup.POST("", faceImageController.UploadFaceImage)
			faceImageGroup.GET("/me", faceImageController.GetMyFaceImages)
			faceImageGroup.GET("/:id/raw", faceImageController.GetFaceImageRaw)
			faceImageGroup.DELETE("/:id", faceImageController.DeleteFaceImage)
		}

		adminFaceImageGroup := adminOnly.Group("/admin/face-images")
		{
			adminFaceImageGroup.GET("", faceImageController.ListFaceImagesForAdmin)
			adminFaceImageGroup.PATCH("/:id/review", faceImageController.ReviewFaceImage)
		}

		evaluationGroup := protected.Group("/evaluations")
		{
			evaluationGroup.POST("", evaluationController.CreateEvaluation)
			evaluationGroup.GET("/students", evaluationController.GetMyStudents) // โค้ช: รายชื่อนักเรียนของตัวเอง (?course_id= กรองเฉพาะคอร์ส)
			evaluationGroup.GET("/courses", evaluationController.GetMyCourses)   // โค้ช: รายชื่อคอร์สที่ตัวเองสอน
			evaluationGroup.GET("/me", evaluationController.GetMyEvaluations)
			evaluationGroup.GET("/me/given", evaluationController.GetMyGivenEvaluations) // โค้ช: ประวัติการประเมินที่ตัวเองให้ไว้
			evaluationGroup.GET("/student/:customer_id", evaluationController.GetStudentEvaluations)
		}

		videoGroup := protected.Group("/videos")
		{
			videoGroup.POST("", videoController.UploadVideo)
			videoGroup.POST("/:raw_video_id/assign", videoController.ManuallyAssignStudents)
			videoGroup.GET("/me", videoController.GetMyDetectedVideos)
			videoGroup.GET("/:raw_video_id/students", videoController.GetVideoDetectedStudents)
			videoGroup.GET("/:raw_video_id/raw", videoController.GetVideoRaw)
		}

		photoPostGroup := protected.Group("/photo-posts")
		{
			photoPostGroup.POST("", photoPostController.UploadPhotoPost)
			photoPostGroup.POST("/:raw_photo_id/assign", photoPostController.AssignStudentsToPhoto)
			photoPostGroup.GET("/:raw_photo_id/students", photoPostController.GetPhotoDetectedStudents)
			photoPostGroup.GET("/:raw_photo_id/raw", photoPostController.GetPhotoPostRaw)
		}

		studentPostsGroup := protected.Group("/students/posts")
		{
			studentPostsGroup.GET("/me", photoPostController.GetMyPosts)
			studentPostsGroup.DELETE("/:type/:raw_id", photoPostController.DeleteMyPost)
		}

		enrollmentGroup := protected.Group("/enrollments")
		{
			enrollmentGroup.POST("/", enrollmentController.EnrollCourse)
			enrollmentGroup.GET("/customer/:id", enrollmentController.GetCustomerEnrollments)
			enrollmentGroup.PATCH("/:id/cancel", enrollmentController.CancelMyEnrollment)
		}

		classConfirmGroup := protected.Group("/class-confirmations")
		{
			classConfirmGroup.GET("/upcoming", classConfirmationController.GetMyUpcoming)
			classConfirmGroup.PUT("", classConfirmationController.Confirm)
			classConfirmGroup.DELETE("", classConfirmationController.Cancel)
		}

		attendanceGroup := adminOnly.Group("/attendance")
		{
			attendanceGroup.GET("/openable", attendanceController.GetOpenablePackages)
			attendanceGroup.GET("/history", attendanceController.GetHistory)
			attendanceGroup.GET("/history/export", attendanceController.ExportHistory)
			attendanceGroup.GET("/coach-history", attendanceController.GetCoachHistory)

			attendanceGroup.GET("/missed-classes", attendanceController.GetMissedClasses)
			attendanceGroup.POST("/missed-classes/resolve", attendanceController.ResolveMissedClass)

			attendanceGroup.GET("/sessions", attendanceController.GetOpenSessions)
			attendanceGroup.POST("/sessions", attendanceController.OpenSession)
			attendanceGroup.GET("/sessions/:id", attendanceController.GetSession)
			attendanceGroup.POST("/sessions/:id/lookup", attendanceController.Lookup)
			attendanceGroup.POST("/sessions/:id/check-in", attendanceController.CheckIn)
			attendanceGroup.POST("/sessions/:id/face-lookup", attendanceController.FaceLookup)
			attendanceGroup.POST("/sessions/:id/face-check-in", attendanceController.FaceCheckIn)
			attendanceGroup.POST("/sessions/:id/manual", attendanceController.ManualCheckIn)
			attendanceGroup.POST("/sessions/:id/coach-manual", attendanceController.ManualCoachCheckIn)
			attendanceGroup.PATCH("/sessions/:id/close", attendanceController.CloseSession)

			attendanceGroup.PATCH("/records/:id", attendanceController.UpdateStatus)
			attendanceGroup.PATCH("/coach-records/:id", attendanceController.UpdateCoachAttendanceStatus)
		}

		adminOnly.GET("/admin/class-confirmations/headcount", classConfirmationController.GetHeadcounts)
		adminOnly.GET("/admin/class-confirmations/roster", classConfirmationController.GetClassRoster)

		adminEnrollmentReviewGroup := adminOnly.Group("/admin/enrollments")
		{
			adminEnrollmentReviewGroup.GET("/:id", enrollmentController.GetEnrollmentReview)
			adminEnrollmentReviewGroup.PATCH("/:id/reject", enrollmentController.RejectEnrollment)
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

		api.GET("/home-content", homeContentController.GetPublicHome)
		api.GET("/home-content/coaches", homeContentController.GetPublicCoaches)

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

		api.GET("/announcements", announcementController.GetActiveAnnouncements)
		api.GET("/announcements/:id", announcementController.GetAnnouncementByID)
		api.POST("/announcements/:id/view", announcementController.IncrementViewCount)
		api.GET("/announcements/categories", announcementController.GetAllCategories)
		api.GET("/announcements/gallery", announcementController.GetGuestGallery)

		adminOnly.GET("/admin/announcements", announcementController.GetAllAnnouncements)

		api.GET("/auto-qas/public", autoQAController.GetPublicAutoQAs)
		api.POST("/chat-sessions", middlewares.PublicChatRateLimit(), autoQAController.CreateChatSession)
		api.GET("/chat-sessions/:id", autoQAController.GetChatSessionByID)
		api.GET("/chat-sessions/:id/stream", middlewares.PublicChatRateLimit(), autoQAController.StreamChatSession)
		api.POST("/chat-sessions/:id/ask", middlewares.PublicChatRateLimit(), autoQAController.AskQuestion)
		api.PATCH("/chat-sessions/:id/messages/:msgId", middlewares.PublicChatRateLimit(), autoQAController.EditMessage)
		api.DELETE("/chat-sessions/:id/messages/:msgId", middlewares.PublicChatRateLimit(), autoQAController.DeleteMessage)
		api.POST("/chat-uploads", middlewares.PublicChatRateLimit(), autoQAController.UploadChatAttachment)

		api.GET("/consents/face/policy", consentController.GetPolicy)

		api.GET("/reviews/featured", reviewController.GetFeaturedReviews)

		reviewGroup := protected.Group("/reviews")
		{
			reviewGroup.POST("", reviewController.CreateReview)
			reviewGroup.GET("/me", reviewController.GetMyReviews)
			reviewGroup.GET("/courses/:course_id/coaches", reviewController.GetCourseCoaches)
		}

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
