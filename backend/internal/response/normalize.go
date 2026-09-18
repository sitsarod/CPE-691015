// Package response รวมตัวช่วยสร้าง HTTP JSON response ให้พฤติกรรมสม่ำเสมอทุก endpoint
package response

import "reflect"

// Normalize คืนสำเนาของ obj ที่ "slice ซึ่งเป็น nil" ทุกจุด (รวมที่ซ้อนอยู่ลึก ๆ)
// ถูกแทนด้วย slice ว่าง เพื่อให้ encoding/json เขียนออกมาเป็น [] แทน null
//
// ทำไมต้องมี: Go marshal nil slice เป็น null ทำให้ฝั่ง frontend ที่เรียก
// .map/.filter/.length บนฟิลด์นั้นพัง ("Cannot read properties of null")
// แก้ที่นี่ที่เดียวครอบคลุมทุก endpoint แทนที่จะไล่ default ทีละ DTO/ทีละหน้า
//
// รองรับ struct, pointer, interface, slice, array และ map (เช่น gin.H)
// ทำงานแบบสร้างค่าใหม่ (ไม่แก้ของเดิม in-place) เพื่อเลี่ยงปัญหา addressability
// ของ element ใน map/interface และไม่ให้ไปแตะ state ที่ caller ถืออยู่
func Normalize(obj any) any {
	if obj == nil {
		return nil
	}
	return normalizeValue(reflect.ValueOf(obj)).Interface()
}

func normalizeValue(rv reflect.Value) reflect.Value {
	switch rv.Kind() {
	case reflect.Interface:
		if rv.IsNil() {
			return rv
		}
		inner := normalizeValue(rv.Elem())
		out := reflect.New(rv.Type()).Elem()
		out.Set(inner)
		return out

	case reflect.Pointer:
		if rv.IsNil() {
			return rv
		}
		inner := normalizeValue(rv.Elem())
		out := reflect.New(inner.Type())
		out.Elem().Set(inner)
		return out

	case reflect.Struct:
		out := reflect.New(rv.Type()).Elem()
		out.Set(rv)
		for i := 0; i < out.NumField(); i++ {
			f := out.Field(i)
			if !f.CanSet() {
				continue // ฟิลด์ unexported — ถูกคัดลอกมาทั้งก้อนแล้วจาก out.Set(rv) ข้างบน
			}
			f.Set(normalizeValue(rv.Field(i)))
		}
		return out

	case reflect.Slice:
		if rv.IsNil() {
			// หัวใจของทั้งหมด: nil slice → slice ว่าง (marshal เป็น [] ไม่ใช่ null)
			return reflect.MakeSlice(rv.Type(), 0, 0)
		}
		out := reflect.MakeSlice(rv.Type(), rv.Len(), rv.Len())
		for i := 0; i < rv.Len(); i++ {
			out.Index(i).Set(normalizeValue(rv.Index(i)))
		}
		return out

	case reflect.Array:
		out := reflect.New(rv.Type()).Elem()
		for i := 0; i < rv.Len(); i++ {
			out.Index(i).Set(normalizeValue(rv.Index(i)))
		}
		return out

	case reflect.Map:
		if rv.IsNil() {
			return rv
		}
		out := reflect.MakeMapWithSize(rv.Type(), rv.Len())
		for _, k := range rv.MapKeys() {
			out.SetMapIndex(k, normalizeValue(rv.MapIndex(k)))
		}
		return out

	default:
		return rv
	}
}
