package routes

import (
    "CPE-691015/internal/config"
    "CPE-691015/internal/controllers"
    "CPE-691015/internal/services"
    "CPE-691015/internal/middlewares"
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

    paymentService := services.NewPaymentService(db)
    paymentController := controllers.NewPaymentController(paymentService)

    billingService := services.NewBillingService(db)
    billingController := controllers.NewBillingController(billingService)

	userService := services.NewUserService(db)
	userController := controllers.NewUserController(userService)
	authService := services.NewAuthService(db)
	authController := controllers.NewAuthController(authService, userService)

	bankAccountService := services.NewBankAccountService(db)
	bankAccountController := controllers.NewBankAccountController(bankAccountService)

	expenseService := services.NewExpenseService(db)
	expenseController := controllers.NewExpenseController(expenseService)

	r.Use(middlewares.CORSMiddleware())
	r.Static("/uploads", "./uploads")
    
    courseService := services.NewCourseService(db)
    courseController := controllers.NewCourseController(courseService)

    packageService := services.NewPackageService(db)
    packageController := controllers.NewPackageController(packageService)

    // Announcement system
    announcementService := services.NewAnnouncementService(db)
    announcementController := controllers.NewAnnouncementController(announcementService)

    // Automated Q&A system
    autoQAService := services.NewAutoQAService(db)
    autoQAController := controllers.NewAutoQAController(autoQAService)

    // Quiz system
    quizService := services.NewQuizService(db)
    quizController := controllers.NewQuizController(quizService)

    r.Use(middlewares.CORSMiddleware())

    api := r.Group("/api")
    {

        authGroup := api.Group("/auth")
        {
            authGroup.POST("/login", authController.Login) 
            authGroup.POST("/register", authController.Register)
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
            coachGroup.GET("/:id", coachController.GetCoachByID)                                  // เจ้าของ หรือ admin
            coachGroup.PATCH("/:id", coachController.UpdateCoach)                                 // เจ้าของ หรือ admin (บาง field)
            coachGroup.GET("/:id/availability", coachAvailabilityController.GetAvailability)      // เจ้าของ หรือ admin
            coachGroup.PUT("/:id/availability", coachAvailabilityController.UpdateAvailability)   // เจ้าของเท่านั้น (admin แก้ไม่ได้)
            coachGroup.GET("/:id/work-schedules", workScheduleController.GetSchedulesByCoach)     // เจ้าของ หรือ admin
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
        adminUserGroup := adminOnly.Group("/users")
        {
            adminUserGroup.GET("/", userController.GetAllUsersController)
            adminUserGroup.GET("/role", userController.GetUserByRoleController)
            adminUserGroup.GET("/students", userController.GetActiveStudentsController)
            adminUserGroup.POST("/", userController.CreateUserController)
            adminUserGroup.DELETE("/:id", userController.DeleteUserController)
        }

        enrollmentGroup := protected.Group("/enrollments")
        {
            enrollmentGroup.POST("/", enrollmentController.EnrollCourse)
            enrollmentGroup.GET("/customer/:id", enrollmentController.GetCustomerEnrollments)
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

        // Announcement endpoints
        api.GET("/announcements", announcementController.GetAllAnnouncements)
        api.GET("/announcements/:id", announcementController.GetAnnouncementByID)
        api.POST("/announcements/:id/view", announcementController.IncrementViewCount)
        api.GET("/announcements/categories", announcementController.GetAllCategories)

        // Automated Q&A Chat Session public endpoints
        api.POST("/chat-sessions", autoQAController.CreateChatSession)
        api.GET("/chat-sessions/:id", autoQAController.GetChatSessionByID)
        api.POST("/chat-sessions/:id/ask", autoQAController.AskQuestion)

        // Quiz public endpoints
        api.GET("/quiz", quizController.GetActiveQuestions)

        protectedAnnouncementGroup := adminOnly.Group("/announcements")
        {
            protectedAnnouncementGroup.POST("/", announcementController.CreateAnnouncement)
            protectedAnnouncementGroup.PATCH("/:id", announcementController.UpdateAnnouncement)
            protectedAnnouncementGroup.DELETE("/:id", announcementController.DeleteAnnouncement)
            protectedAnnouncementGroup.POST("/categories", announcementController.CreateCategory)
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

        protectedQuizGroup := adminOnly.Group("/admin/quiz")
        {
            protectedQuizGroup.GET("/", quizController.GetAllQuestions)
            protectedQuizGroup.POST("/", quizController.CreateQuestion)
            protectedQuizGroup.PUT("/:id", quizController.UpdateQuestion)
            protectedQuizGroup.DELETE("/:id", quizController.DeleteQuestion)
            protectedQuizGroup.POST("/:id/options", quizController.AddOption)
            protectedQuizGroup.DELETE("/options/:option_id", quizController.DeleteOption)
        }
    }
}
