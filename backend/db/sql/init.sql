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

INSERT INTO plc_config (
    ip,
    rack,
    slot
) VALUES (
    '192.168.0.10',
    0,
    1
);