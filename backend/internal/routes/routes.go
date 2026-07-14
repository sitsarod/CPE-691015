package routes

import (
    "CPE-691015/internal/config"
    "CPE-691015/internal/controllers"
    "CPE-691015/internal/services"
    "CPE-691015/internal/midlewares"
    "github.com/gin-gonic/gin"
)

// SetupRoutes registers all API routes for the application
func SetupRoutes(r *gin.Engine) {
    db := config.DB
    
    // Initialize services and controllers
    coachService := services.NewCoachService()
    coachController := controllers.NewCoachController(coachService)

    enrollmentService := services.NewEnrollmentService(db)
    enrollmentController := controllers.NewEnrollmentController(enrollmentService)

    paymentService := services.NewPaymentService(db)
    paymentController := controllers.NewPaymentController(paymentService)

    billingService := services.NewBillingService(db)
    billingController := controllers.NewBillingController(billingService)

	userService := services.NewUserService(db)
	userController := controllers.NewUserController(userService)
	authService := services.NewAuthService(db)
	authController := controllers.NewAuthController(authService)

	bankAccountService := services.NewBankAccountService(db)
	bankAccountController := controllers.NewBankAccountController(bankAccountService)

	expenseService := services.NewExpenseService(db)
	expenseController := controllers.NewExpenseController(expenseService)

	r.Use(midlewares.CORSMiddleware())
	r.Static("/uploads", "./uploads")
    
    courseService := services.NewCourseService(db)
    courseController := controllers.NewCourseController(courseService)

    packageService := services.NewPackageService(db)
    packageController := controllers.NewPackageController(packageService)

    // Announcement system
    announcementService := services.NewAnnouncementService(db)
    announcementController := controllers.NewAnnouncementController(announcementService)

    r.Use(midlewares.CORSMiddleware())

    api := r.Group("/api")
    {

        authGroup := api.Group("/auth")
        {
            authGroup.POST("/login", authController.Login) 
        }

        api.GET("/enrollments/courses", enrollmentController.GetAvailableCourses)
        
        publicCourseGroup := api.Group("/courses")
        {
            publicCourseGroup.GET("/", courseController.GetAllCourse) 
            publicCourseGroup.GET("/:id", courseController.GetCourseByID)
        }
        

        protected := api.Group("")
        protected.Use(midlewares.AuthMiddleware())

        protected.GET("/coaches", coachController.GetCoaches)
        protected.POST("/coaches", coachController.CreateCoach)

        userGroup := protected.Group("/users")
        {
            userGroup.GET("/", userController.GetAllUsersController)
            userGroup.GET("/role", userController.GetUserByRoleController)
            userGroup.GET("/:id", userController.GetUserProfileController)
            userGroup.POST("/", userController.CreateUserController)
            userGroup.PATCH("/:id", userController.UpdateUserController)
            userGroup.DELETE("/:id", userController.DeleteUserController)
        }

        enrollmentGroup := protected.Group("/enrollments")
        {
            enrollmentGroup.POST("/", enrollmentController.EnrollCourse)
            enrollmentGroup.GET("/customer/:id", enrollmentController.GetCustomerEnrollments)
            enrollmentGroup.PATCH("/:id", enrollmentController.UpdateEnrollment)
            enrollmentGroup.DELETE("/:id", enrollmentController.DeleteEnrollment)
        }

        paymentGroup := protected.Group("/payments")
        {
            paymentGroup.POST("/invoices", paymentController.CreateInvoice)
            paymentGroup.POST("/invoices/:id/slip", paymentController.UploadSlip)
            paymentGroup.POST("/invoices/:id/confirm", paymentController.ConfirmPayment)
            paymentGroup.GET("/invoices/customer/:id", paymentController.GetCustomerInvoices)
            paymentGroup.PATCH("/invoices/:id/reject", paymentController.RejectPayment)
            paymentGroup.PATCH("/invoices/:id/cancel", paymentController.CancelInvoice)
        }

        billingGroup := protected.Group("/billings")
        {
            billingGroup.GET("/", billingController.GetAllBillings)
            billingGroup.GET("/:id", billingController.GetBillingByID)
            billingGroup.GET("/customer/:id", billingController.GetCustomerBillings)
            billingGroup.POST("/", billingController.CreateBilling)
            billingGroup.POST("/split", billingController.CreateSplitBilling)
            billingGroup.PATCH("/:id", billingController.UpdateBilling)
            billingGroup.DELETE("/:id", billingController.DeleteBilling)
        }

		bankAccountsGroup := protected.Group("/bank-accounts")
		{
			bankAccountsGroup.GET("/", bankAccountController.GetAllBankAccounts)
			bankAccountsGroup.POST("/", bankAccountController.CreateBankAccount)
			bankAccountsGroup.PATCH("/:id", bankAccountController.UpdateBankAccount)
			bankAccountsGroup.PATCH("/:id/toggle", bankAccountController.ToggleBankAccount)
			bankAccountsGroup.DELETE("/:id", bankAccountController.DeleteBankAccount)
		}

		api.POST("/upload", expenseController.UploadFileHandler)

		expensesGroup := protected.Group("/expenses")
		{
			expensesGroup.GET("/", expenseController.GetAllExpenses)
			expensesGroup.POST("/", expenseController.CreateExpense)
			expensesGroup.DELETE("/:id", expenseController.DeleteExpense)
		}

        protectedCourseGroup := protected.Group("/courses")
        {
            protectedCourseGroup.POST("/", courseController.CreateCourse)
            protectedCourseGroup.PATCH("/:id", courseController.UpdateCourse)
            protectedCourseGroup.DELETE("/:id", courseController.DeleteCourse)
        }

        packageGroup := protected.Group("/packages")
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

        protectedAnnouncementGroup := protected.Group("/announcements")
        {
            protectedAnnouncementGroup.POST("/", announcementController.CreateAnnouncement)
            protectedAnnouncementGroup.PATCH("/:id", announcementController.UpdateAnnouncement)
            protectedAnnouncementGroup.DELETE("/:id", announcementController.DeleteAnnouncement)
            protectedAnnouncementGroup.POST("/categories", announcementController.CreateCategory)
        }
    }
}
