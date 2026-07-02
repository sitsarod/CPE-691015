package controllers

import (
	"net/http"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/models"
	"CPE-691015/internal/config"

	"github.com/gin-gonic/gin"
)

func GetAllCourse(c *gin.Context) {
	db := config.DB

	var courses []models.Course // แนะนำให้ใช้ชื่อพหูพจน์ (courses) จะได้ไม่สับสนตัวแปรในลูป

	err := db.Preload("User").
		Preload("Packages").
		Order("id ASC").
		Find(&courses).Error

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var response []dto.CourseDTO

	for _, courseItem := range courses {

		var packagesDTO []dto.CoursePackageDTO

		// วนลูปย่อยเพื่อเปลี่ยนเเปลงเเต่ละ package ไปเป็น DTO
		for _, pkg := range courseItem.Packages {
			packagesDTO = append(packagesDTO, dto.CoursePackageDTO{
				SessionsCount: pkg.SessionsCount,
				HoursCount:    pkg.HoursCount,
				Price:         pkg.Price,
			})
		}

		// สร้าง object ของ CourseDTO เพื่อเตรียมส่งออกไป
		item := dto.CourseDTO{
			ID:          courseItem.ID,
			CourseName:  courseItem.CourseName,
			Description: courseItem.Description,
			Status:      string(courseItem.Status),
			Packages:    packagesDTO,
		}

		if courseItem.User != nil {
			item.User = &dto.CourseUserDTO{
				FirstName: courseItem.User.FirstName,
				LastName:  courseItem.User.LastName,
				Email:     courseItem.User.Email,
			}
		}

		response = append(response, item)
	}

	c.JSON(http.StatusOK, response)
}
