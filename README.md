# Danışman Kadro Planlama ve Optimizasyon Sistemi (Bağımsız Çekirdek)

Bu proje; 81 il için nüfus, ekonomik büyüklük, banka/finans şube dağılımı ve sektörel göstergeler temelli dinamik danışman kapasite planlaması yapan **Dinamik Sınıf Payı Modeli V5** algoritmasını ve web tabanlı simülasyon sistemini içermektedir.

Mevcut projeden **tamamen bağımsız**, modüler, **sıfır veri (zero-data)** ve **sıfır anahtar (zero-key)** prensibiyle ayrıştırılmıştır.

---

## 🔒 Gizlilik, Veri ve Güvenlik Beyanı

1. **Hiçbir Veri Taşınmamıştır:**
   - Orijinal projede bulunan `Kapasite Planlaması Model Uyumlu.xlsx` ve benzeri hiçbir kurumsal/operasyonel veri dosyası buraya **kopyalanmamıştır**.
   - Kod içinde yer alan geçmiş varsayılan kadro sayıları (İstanbul, İzmir, Ankara gibi baz değerler) sıfırlanmış ve dinamik parametrik şablonlara dönüştürülmüştür.
   - Yalnızca veri yapısını açıklayan boş şema (`schema/data_schema.json`) ve boş başlık satırı (`schema/sample_template.csv`) sağlanmıştır.
2. **Hiçbir Gizli Anahtar / Şifre Taşınmamıştır:**
   - Sistem %100 yerel (istemci tarafında) ve çevrimdışı çalışmaktadır.
   - Kod tabanı baştan sona taranmış; hiçbir API anahtarı, gizli token veya kimlik bilgisi aktarılmamıştır.
   - İleriye dönük servis bağlantıları için güvenli `.env.example` şablonu ve veri dosyalarını engelleyen `.gitignore` kuralları eklenmiştir.

---

## 📁 Proje Dosya ve Klasör Yapısı

```text
kadro_planlama_ve_optimizasyon_sistemi/
├── index.html                   # Modüler web dashboard arayüzü (harici CSS/JS çağırır)
├── standalone.html              # Sıfır bağımlılıkla tek tıkla her yerde açılabilen taşınabilir sürüm
├── css/
│   └── styles.css               # Modern, responsive dashboard tasarım sistemi ve stilleri
├── js/
│   ├── vendor/
│   │   └── jszip.min.js         # Tarayıcı içi Excel OpenXML okuma/yazma kütüphanesi
│   ├── engine/
│   │   ├── model.js             # Saf optimizasyon motoru (DOM bağımsız, Node/tarayıcı uyumlu)
│   │   └── excel-handler.js     # Excel dosya doğrulama, sanal API (/api/calculate) ve dışa aktarım
│   └── app.js                   # Dashboard etkileşimleri, SVG grafikler, filtreler ve senaryo yönetimi
├── python/
│   ├── model_engine.py          # Algoritmanın saf Python 3 karşılığı (veri bilimi & analiz için)
│   └── test_model.py            # Algoritmanın doğrulama ve birim testleri (4/4 test başarılı)
├── schema/
│   ├── data_schema.json         # Modelin beklediği 38 kolonun teknik tanımları (VERİSİZ)
│   └── sample_template.csv      # Yalnızca kolon başlıklarını içeren boş şablon (VERİSİZ)
├── .env.example                 # Güvenli ortam değişkenleri şablonu (boş)
├── .gitignore                   # Veri ve gizli dosyaları hariç tutma kuralları
└── README.md                    # Bu dokümantasyon
```

---

## 🧠 Kurulan Algoritmanın Mantığı (Dinamik Sınıf Payı Modeli V5)

Algoritma, 81 ilin potansiyelini ve optimal kadro ihtiyacını belirlemek için çok katmanlı bir optimizasyon uygular:

### 1. OECD Bileşik Endeks ve Logaritmik Normalizasyon
Her il için göstergeler (GSYH, konut fiyatı, mevduat, istihdam, banka şubeleri vb.) aşağıdaki formülle [0, 1] aralığına normalize edilir:
$$I_{norm} = \frac{x - x_{min}}{x_{max} - x_{min}}$$
Büyük hacimli finansal ve fiziksel göstergeler (mevduat, döviz bürosu, ATM) logaritmik dönüşüme tabi tutulur:
$$x_{log} = \ln(1 + \max(0, x))$$

### 2. Yapısal Gösterge Grupları
- **Zenginlik ve Finans (%25):** GSYH, Konut m² Fiyatı, Mevduat, Sigortalı Oranı.
- **Ekonomik Hareketlilik (%25):** Satış Adedi, İstihdam, Taşıt Sayısı, Poliçe Sayısı, Sigorta Ettiren Sayısı.
- **Rakip Firma Aktifliği (%25):** Banka Şube Sayısı, ATM Sayısı.
- **Döviz ve Yabancı Talep (%25):** Döviz Bürosu Sayısı, Yabancılara Satış.

Kullanıcı arayüzdeki sürgülerle bu ağırlıkları veya nüfus ağırlığını dinamik olarak değiştirebilir.

### 3. Hedef ve Bütçe Dağıtımı (Optimization Allocation)
- **Hedef Artışı (Büyüme):** Yeni alınacak danışmanlar, illerin operasyonel öncelik puanları ve öneri çarpanları ile orantılı olarak dağıtılır. "Yeterli Büyüme" sınıfındaki illere dinamik sınırlı bir pay ayrılır.
- **Hedef Azalışı (Küçülme):** Toplam kadro düşürüldüğünde, illerin mevcut güçleri korunarak **En Büyük Kalan (Hare-Niemeyer / Largest Remainder)** yöntemi ile kadro azaltımı yapılır.
- **Bölge Filtreleme (Genel Müdürlükler):** Seçilen GM bölgeleri (Anadolu, Marmara, Ege-Akdeniz, Karadeniz) kapsam dahilinde tutularak büyüme hedefleri sadece seçili bölgelere yönlendirilebilir.

---

## 🚀 Nasıl Çalıştırılır?

### A. Web Dashboard Olarak Çalıştırma

1. **Taşınabilir / Hızlı Kullanım:**
   - `standalone.html` dosyasına çift tıklayarak herhangi bir tarayıcıda doğrudan açabilirsiniz.
   - Açılan ekranda kendi yerel model Excel dosyanızı seçtiğinizde tüm hesaplamalar tarayıcınızın belleğinde anında yapılır. Hiçbir veri internete veya sunucuya gitmez.

2. **Modüler Web Projesi Olarak:**
   - Klasör içinde yerel bir web sunucusu çalıştırabilirsiniz:
     ```powershell
     # Python ile çalıştırmak için:
     py -m http.server 8000
     ```
   - Tarayıcınızda `http://localhost:8000/index.html` adresine gidin.

### B. Python Algoritma Motorunu Kullanma

Veri bilimi projelerinde, Jupyter Notebook'ta veya toplu hesaplamalarda:
```python
from python.model_engine import build_scenario

# Örnek il listesi (kendi verinizle doldurabilirsiniz):
provinces = [
    {"city": "Adana", "population": 2200000, "current": 50, "score": 0.65, "recommendation": "Öncelikli Büyüme Fırsatı +++"},
    {"city": "İzmir", "population": 4400000, "current": 100, "score": 0.85, "recommendation": "Güçlü Büyüme Fırsatı ++"},
]

# Hedef kadro belirleyip senaryoyu çözdürün:
result = build_scenario(provinces, {"target": 180})
print("Model Çıktısı:", result["gross_hires"], "yeni kadro dağıtıldı.")
```

Birim testleri çalıştırmak için:
```powershell
cd python
py test_model.py
```
*(Tüm testler 0.001 saniyede başarıyla tamamlanır).*
