package routes

import (
	"CPE-691015/internal/config"
	"CPE-691015/internal/controllers"
	"CPE-691015/internal/services"
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

	courseService := services.NewCourseService(db)
    courseController := controllers.NewCourseController(courseService)

	api := r.Group("/api")
	{
		api.GET("/coaches", coachController.GetCoaches)
		api.POST("/coaches", coachController.CreateCoach)
		api.POST("/login", authController.Login)

		userGroup := api.Group("/users")
		{
			userGroup.GET("/", userController.GetAllUsersController)
			userGroup.GET("/role", userController.GetUserByRoleController)
			userGroup.GET("/:id", userController.GetUserProfileController)
			userGroup.POST("/", userController.CreateUserController)
			userGroup.PATCH("/:id", userController.UpdateUserController)
			userGroup.DELETE("/:id", userController.DeleteUserController)
		}

		enrollmentGroup := api.Group("/enrollments")
		{
			enrollmentGroup.GET("/courses", enrollmentController.GetAvailableCourses)
			enrollmentGroup.POST("/", enrollmentController.EnrollCourse)
			enrollmentGroup.GET("/customer/:id", enrollmentController.GetCustomerEnrollments)
			enrollmentGroup.PATCH("/:id", enrollmentController.UpdateEnrollment)
			enrollmentGroup.DELETE("/:id", enrollmentController.DeleteEnrollment)
			
			enrollmentGroup.POST("/:id/schedules", enrollmentController.SetupSchedule)
			enrollmentGroup.PUT("/schedules/:id", enrollmentController.UpdateSchedule)
			enrollmentGroup.DELETE("/schedules/:id", enrollmentController.DeleteSchedule)
		}

		paymentGroup := api.Group("/payments")
		{
			paymentGroup.POST("/invoices", paymentController.CreateInvoice)
			paymentGroup.POST("/invoices/:id/slip", paymentController.UploadSlip)
			paymentGroup.POST("/invoices/:id/confirm", paymentController.ConfirmPayment)
			paymentGroup.GET("/invoices/customer/:id", paymentController.GetCustomerInvoices)
		}

		billingGroup := api.Group("/billings")
		{
			billingGroup.POST("/", billingController.CreateBilling)
			billingGroup.POST("/split", billingController.CreateSplitBilling)
		}

		courseGroup := api.Group("/courses")
		{
			courseGroup.GET("/", courseController.GetAllCourses)
			courseGroup.POST("/", courseController.CreateCourse)
			courseGroup.GET("/:id", courseController.GetCourseByID)
			courseGroup.PATCH("/:id", courseController.UpdateCourse)
			courseGroup.DELETE("/:id", courseController.DeleteCourse)
		}
	}
}
