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
	}
}
