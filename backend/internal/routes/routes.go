package routes

import (
	"CPE-691015/internal/controllers"
	"CPE-691015/internal/services"
	"github.com/gin-gonic/gin"
)

// SetupRoutes registers all API routes for the application
func SetupRoutes(r *gin.Engine) {
	// Initialize services and controllers
	coachService := services.NewCoachService()
	coachController := controllers.NewCoachController(coachService)

	api := r.Group("/api")
	{
		api.GET("/coaches", coachController.GetCoaches)
		api.POST("/coaches", coachController.CreateCoach)
	}
}
