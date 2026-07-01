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

	api := r.Group("/api")
	{
		api.GET("/coaches", coachController.GetCoaches)
		api.POST("/coaches", coachController.CreateCoach)

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
	}
}
