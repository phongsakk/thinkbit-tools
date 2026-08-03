# Thinkbit Tools — Oil Tax Utility Tools

เครื่องมือภายในสำหรับอ่านและตรวจสอบเอกสารการยื่นภาษีน้ำมันจากการผลิต
เพื่อยืนยันรายการที่ขอลดหย่อนว่าถูกต้องตามกฎหมายก่อนนำไปใช้ลดหย่อนภาษี

## เครื่องมือหลัก

| เมนู | URL | หน้าที่สั้นๆ |
| --- | --- | --- |
| หน้าหลัก | `/` | Hub เข้าเครื่องมือ + สรุปสุขภาพระบบ (ไม่สร้าง session) |
| ยืนยันตำแหน่ง | `/auth` | ตรวจ geofence / เปิด session |
| ชุดอัปโหลด | `/upload-batches` | ดูชุดอัปโหลดเอกสารแบบจัดกลุ่มตาม batch |
| โต๊ะเอกสาร | `/docs` | ค้นหา/เปิด/เตรียม/OCR เอกสารใน Cosmos |
| คลัง PDF | `/pdf-cache` | ดูไฟล์ PDF ที่ cache ไว้ |

> User flow: หน้าหลัก → (ยืนยันตำแหน่งถ้ายังไม่มี session) → ชุดอัปโหลด → โต๊ะเอกสาร → คลัง PDF

> Redirects (permanent):
> - `/cosmos`, `/doc-workbench` → `/docs`
> - `/upload-history` → `/upload-batches`
> - `/pdf` → `/pdf-cache`

> Geofence: หน้าอื่นที่ไม่มี cookie → `/auth?geo=required&next=...`

```
หน้าหลัก (/) ──แสดงอย่างเดียว──► ไม่สร้าง session
     │
     └─► /auth ──verify geo──► cookie tb_geo_ok
                                    │
ชุดอัปโหลด ──?unixtime=──► โต๊ะเอกสาร ──PDF──► คลัง PDF
```

---

## หน้าหลัก (`/`)

### หน้าที่

หน้า **landing / hub** ของแอป — แนะนำเครื่องมือและแสดงสถานะระบบแบบย่อ  
**ไม่สร้าง/ตรวจ geofence session** — แสดงผลอย่างเดียว

การยืนยันตำแหน่งเพื่อเปิด session อยู่ที่ [`/auth`](#ยืนยันตำแหน่ง-auth)

### การทำงานโดยสรุป

1. แสดงแบรนด์ Thinkbit · Oil Tax และคำอธิบายสั้นๆ
2. ปุ่มลิงก์ไป ชุดอัปโหลด / โต๊ะเอกสาร / คลัง PDF
3. **HealthSummary** (client): สรุป Cosmos / Blob / Cache เท่านั้น (ไม่มี geolocation)
4. ลิงก์ไป `/auth` หากต้องการยืนยันตำแหน่ง

ไม่มี query params สำหรับ session

### ไฟล์สำคัญ

| ไฟล์ | บทบาท |
| --- | --- |
| `app/page.tsx` | หน้าหลัก + tool links |
| `components/health/health-summary.tsx` | สรุปสุขภาพระบบ |
| `app/api/ping/route.ts` | readiness gate |
| `app/api/health/route.ts` | health checks |
| `app/health/page.tsx` | หน้ารายละเอียด health |

---

## ยืนยันตำแหน่ง (`/auth`)

### หน้าที่

หน้า **ตรวจ session / geofence** — อ่านพิกัดอุปกรณ์ แล้วเรียก `/api/geo/verify` เพื่อตั้ง cookie  
ถ้ายังไม่มี session และเข้าหน้าอื่น → proxy redirect มาที่นี่ (`?geo=required&next=...`)

หน้า `/` **ไม่** รัน session นี้

### การทำงานโดยสรุป

1. อ่านตำแหน่งจาก browser Geolocation API
2. `POST /api/geo/verify` → ตั้ง cookie `tb_geo_ok` ถ้าระยะอยู่ในรัศมี
3. ถ้ามี `next` → พาไปหน้านั้นหลังอนุญาต
4. Public path (เข้าได้โดยไม่มี cookie): `/`, `/auth`, `/api/geo/*`, `/api/ping`, `/api/health`

### ไฟล์สำคัญ

| ไฟล์ | บทบาท |
| --- | --- |
| `app/auth/page.tsx` | หน้ายืนยันตำแหน่ง |
| `components/health/device-geolocation.tsx` | UI อ่านพิกัด + verify |
| `proxy.ts` | redirect ไป `/auth` เมื่อไม่มี session |
| `lib/geo-fence.ts` | cookie / public paths / distance |

---

## โต๊ะเอกสาร (`/docs`)

### หน้าที่

เครื่องมือหลักสำหรับ **ค้นหา เปิด ตรวจ เตรียมข้อมูล และ OCR เอกสารภาษีน้ำมันใน Cosmos DB**  
จัดผลเป็น tree: batch → DOC → page แล้ว Fetch / Prepare / PDF / OCR / Cache / Zip ได้

ผู้ใช้ทั่วไป: เริ่มจากชุดอัปโหลด → เปิด batch → ตรวจทีละหน้า → Prepare / OCR

### การทำงานโดยสรุป

```
searchParams / Search
        │
        ▼
Cosmos query (lite: id, blobFileName) + disk cache
        │
        ▼
tree: batch(unixtime) → DOC#### → page
        │
        ▼
เลือก page → Fetch / Prepare / PDF / OCR / Cache / Flush / Zip
```

1. **SSR** อ่าน filter จาก query → โหลดผลค้นหาเริ่มต้น
2. **Filter fields:** `unixtime` (like), `id`, `docType`, `documentGroup`
3. **Actions ต่อ page:** Fetch, Prepare, PDF, OCR, Cache, Flush; Zip ต่อ DOC
4. **Cache ลงดิสก์:** `download/cosmos/`, `download/prepare/`, `download/blob/`
5. Deep-link จากเครื่องมืออื่น: `?unixtime=` (ชุดอัปโหลด), `?id=` (คลัง PDF)

### Query params

| Param | ความหมาย |
| --- | --- |
| `unixtime` | shortcut → filter like บน blobFileName |
| `id` | shortcut → exact document id |
| `field` + `mode` + `value` | filter ทั่วไป |
| `view` | `table` \| `raw` |
| `fresh` | `1` = ข้าม query cache |

### API ที่เกี่ยวข้อง (หลัก)

`/api/cosmos/query`, `/item/[id]`, `/prepare`, `/pdf`, `/ocr`, `/download`, `/cache`, `/cache/batch`, `/doc-zip`

### ไฟล์สำคัญ

| ไฟล์ | บทบาท |
| --- | --- |
| `app/docs/page.tsx` | หน้า SSR |
| `components/cosmos/cosmos-explorer.tsx` | UI หลัก (`DocWorkbench`) |
| `lib/cosmos-query-shared.ts` | filter / URL helpers |
| `lib/cosmos-query.ts` | query + cache เริ่มต้น |
| `lib/ocr-prepare-config.ts` | map docType → prepare plan |
| `lib/local-cache.ts` | document / prepare / blob cache |

---

## คลัง PDF (`/pdf-cache`)

### หน้าที่

**แกลเลอรี PDF ที่ cache ไว้แล้วบนดิสก์** (`download/blob` + `manifest.json`)  
ไม่ค้น Cosmos และไม่ดึง Azure โดยตรง — เป็น viewer ของไฟล์ที่มีอยู่แล้ว  
เติม cache จากโต๊ะเอกสาร (ปุ่ม PDF) แล้วมาดูรวมที่นี่ได้

### การทำงานโดยสรุป

```
โต๊ะเอกสาร → POST /api/cosmos/pdf → download/blob/
                                              │
/pdf-cache → GET /api/cosmos/pdf/list ←───────┘
         │
         ▼
แกลเลอรี iframe + Open + ลิงก์กลับโต๊ะเอกสาร (?id=)
```

1. โหลดรายการจาก manifest เรียง `savedAt` ใหม่→เก่า
2. Preview / เปิดไฟล์ผ่าน `/download/blob/{fileName}`
3. ปุ่มโต๊ะเอกสาร → `/docs?id={documentId}`
4. ว่าง: แนะนำให้ไปกด PDF ในโต๊ะเอกสารก่อน

ไม่มี query params บน `/pdf-cache`

### ไฟล์สำคัญ

| ไฟล์ | บทบาท |
| --- | --- |
| `app/pdf-cache/page.tsx` | หน้า + metadata |
| `components/pdf/pdf-gallery.tsx` | UI แกลเลอรี |
| `app/api/cosmos/pdf/list/route.ts` | รายการ PDF จาก cache |
| `app/api/cosmos/pdf/route.ts` | cache/stream PDF (ใช้จากโต๊ะเอกสารเป็นหลัก) |
| `lib/local-cache.ts` | blob manifest / save / list |

---

## ชุดอัปโหลด (`/upload-batches`)

### หน้าที่

หน้านี้ทำหน้าที่เป็น **ดัชนีชุดอัปโหลดเอกสาร (upload batches)** จาก Cosmos DB  
ไม่ใช่ประวัติการอัปโหลดไฟล์ทีละไฟล์ แต่เป็นการ **สรุปว่าแต่ละรอบที่ระบบรับเอกสารเข้ามา มีกี่รายการ จากคลังไหน และครอบคลุมช่วงธุรกรรมใด**

ใช้เป็นจุดเริ่มก่อนเปิดโต๊ะเอกสาร เช่น:

1. ดูว่ามี batch อัปโหลดใหม่เมื่อไร
2. กรองตามช่วงเวลาอัปโหลด / คลัง (factory / warehouse)
3. กด **เปิดในโต๊ะเอกสาร** เพื่อเปิดเอกสารของ batch นั้น (`?unixtime=...`)

### การทำงานโดยสรุป

```
Cosmos DB (เอกสาร + blobFileName)
        │
        ▼
parse path → timestamp + factory_id + ช่วงธุรกรรม
        │
        ▼
จัดกลุ่ม (group) ตาม timestamp × factory × period
        │
        ▼
cache ลงไฟล์ (download/upload-history/)
        │
        ▼
SSR แสดงตาราง + filter ผ่าน query params
```

1. **โหลดข้อมูลจาก Cosmos** — query lite: `id`, `blobFileName`, `createdAt`
2. **แกะ metadata จาก `blobFileName`** → `timestamp`, `factory_id`, `transaction_period`
3. **จัดกลุ่ม** ตาม timestamp × factory × period
4. **Filter:** `from_time` / `to_time` / `warehouse` / `fresh=1`
5. **Cache** ที่ `download/upload-history/` (+ warehouse/search manifests)

### API / ไฟล์สำคัญ

- API: `GET/POST /api/cosmos/upload-history`
- หน้า: `app/upload-batches/page.tsx`
- UI: `components/upload-history/upload-history-panel.tsx`
- Service/cache: `lib/upload-history-service.ts`, `lib/upload-history-cache.ts`

---

## Dev

```bash
npm install
npm run dev
```

### Components (shadcn/ui)

```bash
npx shadcn@latest add button
```

```tsx
import { Button } from "@/components/ui/button"
```
