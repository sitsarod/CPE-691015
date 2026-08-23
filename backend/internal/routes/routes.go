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

	// เช็คชื่อเข้าเรียน — แอดมินเปิดรอบที่สนาม นักเรียนเอา QR ประจำตัวมาสแกน
	attendanceService := services.NewAttendanceService(db)
	attendanceController := controllers.NewAttendanceController(attendanceService)

	// ระบบรีวิว/ให้คะแนนคอร์สและโค้ช
	reviewService := services.NewReviewService(db)
	reviewController := controllers.NewReviewController(reviewService)

	personalQRController := controllers.NewPersonalQRController(db)

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
			coachGroup.PATCH("/:id/bank", middlewares.SensitiveRateLimit(), coachController.UpdateCoachBankAccount) // เจ้าของเท่านั้น + ยืนยันรหัสผ่านซ้ำ + จำกัดจำนวนครั้ง
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
			// แยก path จาก DELETE /:id ของแอดมิน เพราะคนละสิทธิ์และคนละกติกา
			enrollmentGroup.PATCH("/:id/cancel", enrollmentController.CancelMyEnrollment)
		}

		// --- เช็คชื่อเข้าเรียน ---
		//
		// ทุกเส้นเป็น adminOnly เพราะเครื่องที่สนามล็อกอินด้วยบัญชีแอดมิน
		// ตัวตนของนักเรียนมาจาก QR ใน body ไม่ใช่จาก JWT — ต่างจากเส้นทางอื่นในระบบ
		attendanceGroup := adminOnly.Group("/attendance")
		{
			attendanceGroup.GET("/openable", attendanceController.GetOpenablePackages)
			attendanceGroup.GET("/history", attendanceController.GetHistory)

			attendanceGroup.POST("/sessions", attendanceController.OpenSession)
			attendanceGroup.GET("/sessions", attendanceController.GetOpenSessions)
			attendanceGroup.GET("/sessions/:id", attendanceController.GetSession)
			// สแกนสองจังหวะ: lookup ไม่เขียนอะไร · check-in บันทึกและหักโควตา
			attendanceGroup.POST("/sessions/:id/lookup", attendanceController.Lookup)
			attendanceGroup.POST("/sessions/:id/check-in", attendanceController.CheckIn)
			attendanceGroup.POST("/sessions/:id/manual", attendanceController.ManualCheckIn)
			attendanceGroup.PATCH("/sessions/:id/close", attendanceController.CloseSession)

			attendanceGroup.PATCH("/records/:id", attendanceController.UpdateStatus)
		}

		adminEnrollmentReviewGroup := adminOnly.Group("/admin/enrollments")
		{
			adminEnrollmentReviewGroup.GET("/:id", enrollmentController.GetEnrollmentReview)
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
		// สาธารณะ: คืนเฉพาะประกาศที่กำลังแสดงผล (active) เท่านั้น ไม่โชว์ที่หมดอายุ/ยังไม่เริ่ม
		api.GET("/announcements", announcementController.GetActiveAnnouncements)
		api.GET("/announcements/:id", announcementController.GetAnnouncementByID)
		api.POST("/announcements/:id/view", announcementController.IncrementViewCount)
		api.GET("/announcements/categories", announcementController.GetAllCategories)

		// แอดมิน: ดูประกาศทั้งหมด (รวมที่หมดอายุ/ยังไม่เริ่ม) สำหรับหน้าจัดการ
		adminOnly.GET("/admin/announcements", announcementController.GetAllAnnouncements)

		// Automated Q&A Chat Session public endpoints
		// /auto-qas/public ส่งรูปแบบย่อ (ไม่มีคีย์เวิร์ด/mode) กันเปิดเผยกลไกหลังบ้าน
		api.GET("/auto-qas/public", autoQAController.GetPublicAutoQAs)
		// สร้าง session และถามคำถามเป็น endpoint สาธารณะที่เขียน DB — ใส่ rate limit กันสแปม
		api.POST("/chat-sessions", middlewares.PublicChatRateLimit(), autoQAController.CreateChatSession)
		api.GET("/chat-sessions/:id", autoQAController.GetChatSessionByID)
		api.POST("/chat-sessions/:id/ask", middlewares.PublicChatRateLimit(), autoQAController.AskQuestion)

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
