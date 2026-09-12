package controllers

import (
	"errors"
	"net/http"
	"strconv"

	"CPE-691015/internal/dto"
	"CPE-691015/internal/services"

	"github.com/gin-gonic/gin"
)

type PackageController struct {
	packageService *services.PackageService
}

func NewPackageController(packageService *services.PackageService) *PackageController {
	return &PackageController{packageService: packageService}
}

// CreatePackage
func (ctrl *PackageController) CreatePackage(c *gin.Context) {
	var input dto.CreatePackageReq

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ครบถ้วน หรือรูปแบบไม่ถูกต้อง"})
		return
	}

	pkg, err := ctrl.packageService.CreatePackage(input)
	if err != nil {
		if errors.Is(err, services.ErrInvalidDuration) ||
			errors.Is(err, services.ErrPackageScheduleInvalid) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "สร้างแพ็กเกจสำเร็จ", "data": pkg})
}

// UpdatePackage
func (ctrl *PackageController) UpdatePackage(c *gin.Context) {
	idParam := c.Param("id")
	packageID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID แพ็กเกจไม่ถูกต้อง"})
		return
	}

	var input dto.UpdatePackageReq
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ข้อมูลไม่ถูกต้อง (เช่น วันในสัปดาห์สะกดผิด)"})
		return
	}

	updatedPkg, err := ctrl.packageService.UpdatePackage(uint(packageID), input)
	if err != nil {
		if errors.Is(err, services.ErrInvalidDuration) ||
			errors.Is(err, services.ErrPackageScheduleInvalid) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if errors.Is(err, services.ErrMaxSeatsBelowEnrolled) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "อัปเดตแพ็กเกจสำเร็จ", "data": updatedPkg})
}

// DeletePackage
func (ctrl *PackageController) DeletePackage(c *gin.Context) {
	idParam := c.Param("id")
	packageID, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID แพ็กเกจไม่ถูกต้อง"})
		return
	}

	if err := ctrl.packageService.DeletePackage(uint(packageID)); err != nil {
		if errors.Is(err, services.ErrPackageHasActiveEnrollments) {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "ลบแพ็กเกจสำเร็จ"})
}
