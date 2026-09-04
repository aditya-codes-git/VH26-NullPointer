# External Traffic Generator

The External Traffic Generator simulates realistic e-commerce traffic and streams synthetic events to the pipeline's ingestion API (`POST /api/ingest`), where events are verified, published to Kafka, consumed by the Kafka consumer, and processed by the adaptive priority engine.

---

## Architecture Flow

```
[ Python Traffic Generator ]
           │
           │  HTTP POST (application/json)
           ▼
[ Express /api/ingest ]
           │
           │  KafkaJS Producer
           ▼
[ Kafka Topic: ecommerce-events ]
           │
           │  KafkaJS Consumer
           ▼
[ Deterministic Classifier & PriorityRouter ]
           │
           ▼
[ Adaptive Engine & Workers ]
           │
           ▼
[ Socket.IO Dashboard (Port 5173) ]
```

---

## Event Types & Weights

| Event Type | Priority Tier | Weight | Purpose |
| :--- | :--- | :--- | :--- |
| **PAYMENT** | **CRITICAL** | 10% | Orders & financial transactions (Never shed) |
| **ORDER** | **CRITICAL** | 10% | Checkout completion (Never shed) |
| **INVENTORY** | **HIGH** | 20% | Stock & product catalog state updates |
| **CLICK** | **LOW** | 35% | User clickstream (Batched / Deferred / Shed under load) |
| **LOG** | **LOW** | 25% | Diagnostics & telemetry (Batched / Deferred / Shed) |

---

## Usage Examples

### 1. Normal Traffic Scenario (~1,000 events/min)
```bash
python traffic_generator.py --scenario normal --duration 60
```

### 2. Flash-Sale Spike Scenario (~20,000 events/min)
```bash
python traffic_generator.py --scenario spike --duration 30
```

### 3. Recovery Scenario (~1,000 events/min)
```bash
python traffic_generator.py --scenario recovery --duration 45
```

### 4. Custom Rate & Duration
```bash
python traffic_generator.py --rate 5000 --duration 60 --concurrency 30
```

### 5. Custom Endpoint
```bash
python traffic_generator.py --endpoint http://localhost:4000/api/ingest --scenario normal
```
