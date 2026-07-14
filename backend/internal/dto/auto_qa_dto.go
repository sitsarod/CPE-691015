package dto

import "time"

type AutoQADTO struct {
	ID              uint      `json:"id"`
	Mode            string    `json:"mode"`
	Question        string    `json:"question"`
	SimilarQuestion string    `json:"similar_question"`
	Answer          string    `json:"answer"`
	SessionID       *uint     `json:"session_id,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type CreateAutoQAReq struct {
	Mode            string `json:"mode" binding:"required,oneof=keyword_match ai_predict"`
	Question        string `json:"question" binding:"required"`
	SimilarQuestion string `json:"similar_question"`
	Answer          string `json:"answer" binding:"required"`
}

type UpdateAutoQAReq struct {
	Mode            string `json:"mode"`
	Question        string `json:"question"`
	SimilarQuestion string `json:"similar_question"`
	Answer          string `json:"answer"`
}

type ChatSessionDTO struct {
	ID         uint        `json:"id"`
	GuestName  string      `json:"guest_name"`
	GuestEmail string      `json:"guest_email"`
	GuestPhone string      `json:"guest_phone"`
	Status     string      `json:"status"`
	UserID     *uint       `json:"user_id,omitempty"`
	User       *UserDTO    `json:"user,omitempty"`
	AutoQAs    []AutoQADTO `json:"auto_qas,omitempty"`
	CreatedAt  time.Time   `json:"created_at"`
	UpdatedAt  time.Time   `json:"updated_at"`
}

type CreateChatSessionReq struct {
	GuestName  string `json:"guest_name" binding:"required"`
	GuestEmail string `json:"guest_email" binding:"required,email"`
	GuestPhone string `json:"guest_phone" binding:"required"`
	UserID     *uint  `json:"user_id"`
}

type UpdateChatSessionReq struct {
	Status string `json:"status" binding:"required,oneof=active closed"`
}

type AskQuestionReq struct {
	Question string `json:"question" binding:"required"`
}

type AskQuestionResponse struct {
	Answer string     `json:"answer"`
	Match  *AutoQADTO `json:"match,omitempty"`
}
