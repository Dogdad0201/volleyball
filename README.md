# 排球手動對角紀錄表 (Volleyball Score Tracker) v2.5.0

一個基於純前端技術（HTML5 / CSS3 / JavaScript ES6）開發的**排球對角攻守數據紀錄表與輪轉調度工具**，支援 PWA 離線使用、行動裝置適配、落點九宮格統計與 CSV 數據匯出。

![GitHub Pages](https://img.shields.io/badge/PWA-Ready-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

---

## 🌟 核心功能亮點

* **對角位置與角色自動計算**：輸入先發球員姓名與舉球起始位（1號或2號），自動配置大砲手、快攻手、舉球員、副攻手與自由球員對角關係。
* **高效能 DOM 局部更新**：點擊攻守數據按鈕（+1 / -1）零延遲即時更新，不傳發全頁面重繪。
* **賽事動作時間軸與九宮格落點**：紀錄欄網失分落點，詳細產出賽事即時行為時間軸。
* **無障礙非阻塞提示 (Toast UI)**：換人調度與操作使用非阻塞浮動提示，賽事紀錄不中斷。
* **防抖動離線自動存檔**：自動備份至瀏覽器 `localStorage`，重新開啟或刷新頁面可隨時載入未完成賽事。
* **一鍵 CSV 數據匯出**：賽後導出完整球員攻守數據明細與時間軸，方便進階 Excel 分析。
* **PWA 支援**：可安裝至手機/平板主畫面，離線無網路環境亦可順暢使用。

---

## 📁 專案檔案結構

```text
Volleyball/
├── index.html        # 主頁面 HTML 結構
├── style.css         # 全站樣式與響應式斷點
├── app.js            # State Store 邏輯與事件委派控制
├── manifest.json     # PWA 設定檔
├── sw.js             # PWA 離線快取 ServiceWorker
└── README.md         # 專案說明文件
```

---

## 🚀 如何在 GitHub Pages 免費上線？

1. 將此專案推送到您的 GitHub 儲存庫。
2. 進入 GitHub Repository 的 **Settings** -> **Pages**。
3. 在 **Build and deployment** > **Branch** 選擇 `main` (或 `master`) 分支與 `/root` 資料夾。
4. 點擊 **Save**，幾秒鐘後即可取得專屬的免費線上紀錄表網址！
