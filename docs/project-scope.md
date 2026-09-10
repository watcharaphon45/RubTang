# RubTang POS – Project Scope Summary

RubTang POS เป็น Web Application แบบ **Multi-Tenant SaaS** โดยใช้ระบบกลางเพียงระบบเดียว แต่รองรับร้านค้าได้หลายร้าน และข้อมูลของแต่ละร้านต้องแยกออกจากกันอย่างชัดเจน

โครงสร้างหลักของระบบคือ

RubTang POS
→ ร้านค้า (Tenant)
→ สาขา (Branch)
→ การขาย / Stock / ผู้ใช้งาน

ร้านหนึ่งร้านสามารถมีได้ตั้งแต่ 1 สาขาขึ้นไป เช่น

* ร้าน A → 1 สาขา
* ร้าน B → 2 สาขา
* ร้าน C → 10 สาขา

ข้อมูลระหว่างร้านต้องไม่สามารถเข้าถึงกันได้

---

## 1. Multi-Tenant

แต่ละร้านจะเป็น Tenant ของระบบ

ข้อมูลสำคัญที่ต้องแยกตามร้าน ได้แก่

* Product
* Category
* Customer
* Supplier
* User
* Promotion
* Coupon
* Loyalty
* LINE OA
* Purchase Order

ผู้ใช้งานของร้าน A จะไม่สามารถเห็นข้อมูลของร้าน B ได้

---

## 2. Multi-Branch

แต่ละร้านสามารถสร้างได้หลายสาขา

ตัวอย่าง

ร้าน ABC

* สาขาสยาม
* สาขาสาทร
* สาขาบางนา

แต่ละสาขาจะมีข้อมูลของตัวเอง เช่น

* Stock
* Sales
* Receipt
* Cashier
* Shift
* Cash Drawer
* Stock Movement

โดย Stock ต้องแยกออกจากกันทุกสาขา

ตัวอย่างสินค้าเดียวกัน

Coke 325 ml

* Siam → 100
* Sathorn → 50
* Bangna → 20

---

## 3. Product Management

ร้านค้าสามารถจัดการสินค้าได้จากส่วนกลาง

ข้อมูลสินค้า เช่น

* Product Name
* SKU
* Barcode
* Category
* Cost
* Selling Price
* Image
* Status

Product จะอยู่ระดับร้าน แต่ Stock จะอยู่ระดับสาขา

ระบบควรรองรับ Default Price และสามารถ Override ราคาตามสาขาได้ในอนาคต

---

## 4. POS

หน้าขายสินค้าจะเป็นส่วนหลักของระบบ

ความสามารถหลัก

* ค้นหาสินค้า
* Scan Barcode
* เลือกสินค้า
* เพิ่ม/ลดจำนวน
* Discount
* Promotion
* Coupon
* คำนวณ VAT
* เลือก Payment Method
* รับเงินสด
* คำนวณเงินทอน
* Checkout
* พิมพ์ใบเสร็จ
* E-Receipt
* ยกเลิกบิล
* Refund

เมื่อขายสำเร็จ ระบบต้องตัด Stock ของสาขาที่ขายทันที

---

## 5. Inventory

Stock จะถูกจัดการแยกตาม Branch

ระบบประกอบด้วย

* Current Stock
* Stock Movement
* Stock Adjustment
* Stock Receiving
* Stock Transfer
* Low Stock Alert

Stock Movement ต้องเก็บประวัติ เช่น

* SALE
* REFUND
* RECEIVE
* TRANSFER IN
* TRANSFER OUT
* ADJUSTMENT
* DAMAGED

เพื่อสามารถตรวจสอบย้อนหลังได้ว่าสินค้าหายหรือเพิ่มจากเหตุการณ์ใด

---

## 6. Stock Transfer

รองรับการโอนสินค้าระหว่างสาขา

ตัวอย่าง

Siam → Sathorn

Coke × 30

สถานะ เช่น

Draft
→ Approved
→ In Transit
→ Received
→ Completed

Stock ของต้นทางและปลายทางจะถูกปรับตามสถานะการส่งสินค้า

---

## 7. Customer

ลูกค้าจะอยู่ระดับร้าน ไม่แยกตามสาขา

ดังนั้นลูกค้าคนเดียวสามารถซื้อสินค้าได้ทุกสาขาของร้านเดียวกัน

ข้อมูล เช่น

* Name
* Phone
* Email
* LINE User ID
* Purchase History
* Loyalty Point
* Coupon

---

## 8. Loyalty

คะแนนสะสมใช้ร่วมกันทุกสาขาของร้าน

ตัวอย่าง

ลูกค้ามี 300 Point

ซื้อที่สาขาสยาม

+20 Point

ยอดรวมเป็น 320 Point

วันถัดมาไปซื้อที่สาขาสาทร สามารถใช้ Point ชุดเดียวกันได้

ระบบควรมี

* Point Earn
* Point Redeem
* Point History
* Expiration
* Loyalty Rule

---

## 9. Promotion & Coupon

Promotion จะอยู่ระดับร้าน

สามารถกำหนดได้ว่า

* ใช้ทุกสาขา
* ใช้เฉพาะบางสาขา

ตัวอย่าง

* ซื้อครบ 500 ลด 10%
* ซื้อ 2 แถม 1
* Member Discount
* Coupon 50 บาท

---

## 10. LINE OA

แต่ละร้านสามารถเชื่อม LINE OA ของตัวเองเข้ากับ RubTang

ตัวอย่าง

RubTang POS

ร้าน A
→ LINE OA ร้าน A

ร้าน B
→ LINE OA ร้าน B

สามารถใช้สำหรับ

* สมัครสมาชิก
* LINE Login
* ดูคะแนน
* ดู Coupon
* แจ้งคะแนนหลังซื้อ
* ส่ง Promotion
* ส่ง E-Receipt
* ดู Purchase History

ในอนาคตสามารถทำ LIFF / LINE Mini App เพิ่มได้

---

## 11. Supplier

แต่ละร้านสามารถมี Supplier ของตัวเอง

ข้อมูล เช่น

* Supplier Name
* Contact
* Phone
* Address
* Tax ID
* Credit Term

Supplier สามารถผูกกับสินค้าได้

---

## 12. Purchase Order

ใช้สำหรับสั่งซื้อสินค้าจาก Supplier

ตัวอย่าง

PO-00001

Supplier: ABC Trading
Destination: Siam Branch

* Coke × 100
* Water × 200

สถานะ เช่น

Draft
→ Ordered
→ Partially Received
→ Received
→ Completed

เมื่อ Receive สินค้า Stock ของสาขาปลายทางจะเพิ่มอัตโนมัติ

---

## 13. User / Role / Permission

ผู้ใช้งานแต่ละคนสามารถกำหนดสิทธิ์ได้

ตัวอย่าง Role

Owner

* ทุกสาขา
* Report
* Setting
* User Management

Manager

* เฉพาะสาขาที่ดูแล
* Stock
* Sales
* Report

Cashier

* POS
* ดู Sales ของตัวเอง
* ไม่มีสิทธิ์แก้ Setting

ควรรองรับ User ที่สามารถดูได้มากกว่า 1 Branch

---

## 14. Dashboard

Dashboard ควรสามารถดูได้ทั้งระดับร้านและระดับสาขา

ตัวอย่าง

* Sales Today
* Sales This Month
* Number of Bills
* Average Order Value
* Best Selling Products
* Low Stock
* Payment Methods
* Branch Comparison

Owner สามารถดูยอดรวมทุกสาขาได้

---

## 15. Reports

รายงานหลัก

* Sales Report
* Product Report
* Stock Report
* Stock Movement
* Payment Report
* Discount Report
* Promotion Report
* Loyalty Report
* Void / Refund Report
* Branch Comparison

รองรับ Export Excel / CSV

---

## 16. Audit Log

ระบบต้องเก็บประวัติการเปลี่ยนแปลงที่สำคัญ เช่น

* เปลี่ยนราคาสินค้า
* ปรับ Stock
* ยกเลิกบิล
* Refund
* เปลี่ยน Promotion
* แก้ User Permission

ข้อมูล Audit ควรระบุ

* User
* Action
* Old Value
* New Value
* Date / Time
* Branch

---

# Development Roadmap

## Phase 1 – Core POS

สร้างระบบที่สามารถขายสินค้าได้จริง

* Multi-Tenant
* Multi-Branch
* Authentication
* User / Role
* Product
* Category
* Branch Inventory
* POS
* Payment
* Receipt
* Sales History

---

## Phase 2 – Inventory

เพิ่มระบบจัดการหลังร้าน

* Stock Movement
* Stock Adjustment
* Stock Transfer
* Supplier
* Purchase Order
* Goods Receiving
* Low Stock Alert

---

## Phase 3 – Customer & CRM

เพิ่มระบบสำหรับรักษาฐานลูกค้า

* Customer
* Loyalty Point
* Promotion
* Coupon
* LINE OA
* E-Receipt

---

## Phase 4 – Management

เพิ่มระบบสำหรับเจ้าของร้านและผู้บริหาร

* Dashboard
* Reports
* Branch Comparison
* Audit Log
* Excel / CSV Export

---

## Phase 5 – RubTang SaaS

ทำ RubTang ให้สามารถเปิดขายเป็น SaaS ได้

* Shop Registration
* Create Tenant
* Create Branch
* Subscription Package
* Trial
* Billing
* Usage Limit
* Super Admin
* Tenant Management

ตัวอย่าง Package

Starter
→ 1 Branch

Business
→ 3 Branches

Pro
→ Unlimited Branches

---

## Phase 6 – Integration

ทำหลังจาก Core System เสถียรแล้ว

* Payment Gateway
* Accounting Integration
* External API
* Webhook

และ **Delivery Integration จะทำเป็นลำดับสุดท้าย**

เช่น

* GrabFood
* LINE MAN
* foodpanda
* Delivery Provider อื่น

---

# Core Architecture

โครงสร้างหลักของ RubTang ควรเป็น

RubTang

→ Tenant
→ Branch
→ Inventory / Sales

ส่วนข้อมูลระดับร้าน

* Product
* Customer
* Loyalty
* Promotion
* Supplier
* User
* LINE OA

ส่วนข้อมูลระดับสาขา

* Stock
* Stock Movement
* Sale
* Receipt
* Shift
* Cash Drawer
* Goods Receiving

แนวคิดสำคัญที่สุดคือ

**ทุกข้อมูลธุรกิจต้องรู้ว่าเป็นของ Tenant ไหน และข้อมูลที่เกี่ยวข้องกับการขายหรือ Stock ต้องรู้ด้วยว่าเป็นของ Branch ไหน**

ด้วย Architecture นี้ RubTang POS จะสามารถเป็นระบบเดียวที่รองรับร้านค้าหลายร้าน หลายสาขา และสามารถขยายเป็น SaaS เชิงพาณิชย์ได้ในอนาคต
