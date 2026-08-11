package dto

import "time"

type DetectedVideoResponse struct {
	ID         uint      `json:"id"`
	CustomerID uint      `json:"customer_id"`
	RawVideoID uint      `json:"raw_video_id"`
	VideoURL   string    `json:"video_url"`
	CreatedAt  time.Time `json:"created_at"`
}

type UploadVideoResponse struct {
	RawVideoID uint   `json:"raw_video_id"`
	VideoURL   string `json:"video_url"`
	StudentIDs []uint `json:"student_ids"`
}
