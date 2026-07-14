package dto

import "time"

type AnnouncementDTO struct {
	ID          uint         `json:"id"`
	Title       string       `json:"title"`
	Content     string       `json:"content"`
	UserID      uint         `json:"user_id"`
	User        *UserDTO     `json:"user"`
	CategoryID  uint         `json:"category_id"`
	Category    *CategoryDTO `json:"category"`
	StartDate   time.Time    `json:"start_date"`
	EndDate     time.Time    `json:"end_date"`
	ViewCount   uint         `json:"view_count"`
	CreatedAt   time.Time    `json:"created_at"`
	UpdatedAt   time.Time    `json:"updated_at"`
}

type UserDTO struct {
	ID        uint   `json:"id"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Email     string `json:"email"`
	Role      string `json:"role"`
}

type CategoryDTO struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}

type CreateAnnouncementReq struct {
	Title      string    `json:"title" binding:"required"`
	Content    string    `json:"content"`
	UserID     uint      `json:"user_id" binding:"required"`
	CategoryID uint      `json:"category_id" binding:"required"`
	StartDate  time.Time `json:"start_date" binding:"required"`
	EndDate    time.Time `json:"end_date" binding:"required"`
}

type UpdateAnnouncementReq struct {
	Title      string    `json:"title"`
	Content    string    `json:"content"`
	UserID     uint      `json:"user_id"`
	CategoryID uint      `json:"category_id"`
	StartDate  time.Time `json:"start_date"`
	EndDate    time.Time `json:"end_date"`
}

type CreateCategoryReq struct {
	Name string `json:"name" binding:"required"`
}
