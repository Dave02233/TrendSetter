# Riassunto Progetto: Sistema PLC Siemens → TimescaleDB con React

## Obiettivo

Applicazione Docker Compose per acquisizione dati da PLC Siemens S7, configurazione dinamica variabili via web UI, storage su TimescaleDB con visualizzazione realtime/storica.

## Architettura Stack

- **Frontend**: React (configurazione variabili + visualizzazione trend)
- **Backend**: Node.js + Express + nodes7 (comunicazione S7)
- **Database**: PostgreSQL + TimescaleDB (timeseries storage)
- **Deploy**: Docker Compose (3 container)

## Database Schema

### Tabella plc_config
- `id` SERIAL PRIMARY KEY
- `ip` VARCHAR NOT NULL
- `rack` INTEGER NOT NULL
- `slot` INTEGER NOT NULL
- **Default values**: ('192.168.0.10', 0, 1)

### Tabella config
- `id` SERIAL PRIMARY KEY (auto-generato)
- `name` VARCHAR NOT NULL (es. "Temperatura1")
- `address` VARCHAR NOT NULL (es. "DB10.DBW0", "DB10.DBX2.0")
- `data_type` VARCHAR NOT NULL ("Int", "Bool", "Real")
- `sampling_interval` INTEGER NOT NULL (millisecondi: 500, 1000, 5000)

### Tabella data (TimescaleDB hypertable)
- `timestamp` TIMESTAMPTZ (hypertable partition key)
- `sensor_id` INTEGER NOT NULL (FK → config.id **ON DELETE CASCADE**)
- `value` NUMERIC (Bool convertiti a 0/1)

**Note**: CASCADE delete configurato - eliminando variabile da config si eliminano automaticamente tutti i dati correlati.

## Funzionalità Backend Implementate

### API REST - Variables ✅

```javascript
GET    /api/variables          - Lista tutte le variabili configurate
POST   /api/variables          - Aggiungi nuova variabile
PUT    /api/variables/:id      - Modifica variabile esistente
DELETE /api/variables/:id      - Rimuovi variabile (CASCADE delete su data)
POST   /api/variables/apply    - TRUNCATE config + INSERT bulk + restart polling
```

**Dettagli implementazione**:
- **GET /**: Query `SELECT * FROM config ORDER BY id`
- **POST /**: INSERT con validazione campi required (name, address, data_type, sampling_interval)
- **PUT /:id**: UPDATE con controllo 404 se id non esiste
- **DELETE /:id**: DELETE con RETURNING *, gestione 404, CASCADE automatico su tabella data
- **POST /apply**: Transaction con TRUNCATE + INSERT bulk da array, rollback su errore

### API REST - PLC ✅

```javascript
GET    /api/plc                - Leggi configurazione PLC corrente
PUT    /api/plc                - Aggiorna IP/rack/slot PLC
```

**Dettagli implementazione**:
- **GET /**: Query su plc_config (singola row, id = 1)
- **PUT /**: UPDATE plc_config SET ip, rack, slot WHERE id = 1

### API REST - Data (TODO)

```javascript
GET    /api/data               - Query multi-variable con range temporale
```

### WebSocket (TODO)

- Stream dati realtime ultimi 30 minuti
- Update ogni 1 secondo
- Supporto multi-variabile (penne multiple)

### Polling Manager (TODO)

- Multi-interval: gestisce 3 gruppi (500ms, 1s, 5s)
- Polling S7 tramite nodes7
- INSERT dati in data table: (NOW(), variable_id, value)
- Restart dinamico su apply config

## Struttura Directory Backend

```
backend/
├── package.json (express, pg, cors, dotenv)
├── .env
│   ├── DB_USER=postgres
│   ├── DB_PASSWORD=postgres
│   ├── DB_HOST=timescaledb
│   ├── DB_PORT=5432
│   ├── DB_NAME=plc_data
│   └── PORT=3001
├── server.js (entry point con middleware)
├── db/
│   └── index.js (pg Pool singleton)
├── routes/
│   ├── variables.js ✅
│   ├── plc.js ✅
│   └── data.js (TODO)
└── init.sql (schema TimescaleDB con CASCADE)
```

### File Chiave Implementati

**server.js**:
```javascript
const express = require('express');
const cors = require('cors');
const variablesRoutes = require('./routes/variables');
const plcRoutes = require('./routes/plc');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/variables', variablesRoutes);
app.use('/api/plc', plcRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(3001, () => console.log('Server running on port 3001'));
```

**db/index.js**:
```javascript
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME
});

module.exports = pool;
```

**init.sql**:
```sql
CREATE TABLE plc_config (
    id SERIAL PRIMARY KEY,
    ip VARCHAR NOT NULL, 
    rack INTEGER NOT NULL,
    slot INTEGER NOT NULL
);

CREATE TABLE config (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL,
    address VARCHAR NOT NULL,
    data_type VARCHAR NOT NULL,
    sampling_interval INTEGER NOT NULL
);

CREATE TABLE data (
    timestamp TIMESTAMPTZ,
    sensor_id INTEGER NOT NULL,
    value NUMERIC,
    FOREIGN KEY (sensor_id) REFERENCES config (id) ON DELETE CASCADE
);

SELECT create_hypertable('data', 'timestamp');

INSERT INTO plc_config (ip, rack, slot) VALUES ('192.168.0.10', 0, 1);
```

## Pattern e Best Practices Adottati

### Gestione Errori
- Try-catch in tutte le route async
- Status code appropriati: 200 (OK), 404 (Not Found), 500 (Internal Server Error)
- Response JSON consistente: `{ message: '...' }` per errori
- Logging errori con `console.error()` per debugging

### Response Handling
- `return res.status(404).json(...)` per evitare double-response
- `RETURNING *` nelle query INSERT/UPDATE/DELETE per restituire dati modificati
- Controllo `dbRes.rows.length === 0` per rilevare record non trovati

### Database
- Parametrized queries con `$1, $2` per prevenire SQL injection
- Transaction con BEGIN/COMMIT/ROLLBACK per operazioni atomiche (apply)
- TRUNCATE per reset rapido config
- ON DELETE CASCADE per integrità referenziale automatica

### Validazione
- Controllo campi required nel body delle request
- Validazione tipo dati lato database (VARCHAR NOT NULL, INTEGER NOT NULL)

## Docker Compose Setup (TODO)

```yaml
services:
  timescaledb:
    image: timescale/timescaledb:latest-pg14
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: plc_data
    volumes:
      - ./backend/init.sql:/docker-entrypoint-initdb.d/init.sql
      - timescale-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    environment:
      DB_HOST: timescaledb
      DB_PORT: 5432
      DB_USER: postgres
      DB_PASSWORD: postgres
      DB_NAME: plc_data
      PORT: 3001
    ports:
      - "3001:3001"
    depends_on:
      - timescaledb

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  timescale-data:
```

## Test Effettuati

### Variables API
✅ **POST /api/variables** - Inserimento variabile:
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/variables" -Method POST -ContentType "application/json" -Body '{
  "name": "test_sensor",
  "address": "DB1.DBW0",
  "data_type": "INT",
  "sampling_interval": 1000
}'
```
**Response**: `{ id: 3, name: "test_sensor", address: "DB1.DBW0", ... }`

✅ **DELETE /api/variables/3** - Eliminazione variabile:
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/variables/3" -Method DELETE
```
**Response**: Record eliminato + CASCADE delete automatico su tabella data

✅ **GET /api/variables/3** - Verifica 404:
**Response**: `{ message: 'Variable not found' }` con status 404

## Workflow Utente

1. **Config PLC**: GET/PUT su `/api/plc` per impostare IP PLC
2. **Gestione Variabili**:
   - GET `/api/variables` - Lista variabili
   - POST `/api/variables` - Aggiungi singola variabile
   - PUT `/api/variables/:id` - Modifica variabile
   - DELETE `/api/variables/:id` - Rimuovi variabile (CASCADE su dati)
3. **Apply Config**: POST `/api/variables/apply` con array di variabili → TRUNCATE + INSERT bulk + restart polling
4. **Visualizza Dati**: (TODO) GET `/api/data` per storico, WebSocket per realtime

## Prossimi Steps

### Backend
1. ✅ ~~Setup directory structure~~
2. ✅ ~~Database schema con TimescaleDB~~
3. ✅ ~~API Variables (CRUD completo)~~
4. ✅ ~~API PLC (GET/PUT)~~
5. ⏳ API Data (query range temporale con aggregazioni)
6. ⏳ WebSocket service per streaming realtime
7. ⏳ S7 Service (nodes7 wrapper)
8. ⏳ Polling Manager (multi-interval con restart dinamico)

### Frontend (TODO)
1. Setup React + routing
2. Componente configurazione PLC
3. Componente gestione variabili (tabella + form)
4. Componente visualizzazione trend (chart library)
5. WebSocket client per dati realtime

### DevOps (TODO)
1. Dockerfile backend
2. Dockerfile frontend
3. Docker Compose orchestration
4. Testing integrazione end-to-end

## Note Tecniche

- **PowerShell**: Usare `Invoke-RestMethod` invece di `curl` per test API
- **Porta**: Backend su 3001 (non 3000 per evitare conflitti con React dev server)
- **Validazione**: Tutti i campi config sono NOT NULL, validare lato client prima di submit
- **CASCADE**: Eliminare variabile → elimina automaticamente tutti i dati storici associati