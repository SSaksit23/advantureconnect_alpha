/* eslint-disable camelcase */

// This is an example of an initial migration file for node-pg-migrate.
//
// How this file would typically be generated and used:
// 1. Install node-pg-migrate and dotenv:
//    `npm install --save-dev node-pg-migrate dotenv` (in your backend directory)
//
// 2. Create a migrations directory and configuration file:
//    The `db-migrate-setup.js` script (provided previously) helps with this, creating:
//    - `backend/migrations/` directory
//    - `backend/migrations/.pgmigraterc.js` (configured to use DATABASE_URL from backend/.env)
//
// 3. Create this migration file:
//    Run from the `backend/` directory:
//    `npx node-pg-migrate -m "migrations" create initial-schema-setup`
//    This command generates a new migration file with a timestamp prefix (e.g., `<timestamp>-initial-schema-setup.js`).
//
// 4. Edit the generated file:
//    - Copy the content of your existing `backend/database/schema.sql` into the `exports.up` function.
//    - Define the `exports.down` function to revert the schema changes (e.g., drop all tables).
//
// 5. Run the migration:
//    Run from the `backend/` directory:
//    `npx node-pg-migrate -m "migrations" up`
//
// This initial migration effectively imports your existing database schema into the
// migration system, allowing future schema changes to be managed incrementally.

exports.shorthands = undefined; // No shorthands used for raw SQL

exports.up = pgm => {
  // The entire content of your `backend/database/schema.sql` file would be placed
  // inside the pgm.sql(``) template literal.
  // Ensure that any backticks (`) within your SQL are escaped if necessary,
  // or use a different string quoting mechanism if your SQL contains many backticks.
  // For this example, we'll include a placeholder.
  // The .pgmigraterc.js file was configured with `migrationsTransaction: 'disable'`,
  // which is often necessary for initial schema imports that might include
  // commands like `CREATE EXTENSION` or other DDL that cannot run inside a transaction.

  pgm.sql(`
    -- Placeholder for the full content of backend/database/schema.sql
    -- This would start with:
    -- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    --
    -- CREATE TABLE IF NOT EXISTS users (
    --     id SERIAL PRIMARY KEY,
    --     email VARCHAR(255) UNIQUE NOT NULL,
    --     ...
    -- );
    -- ... and include all table creations, index creations, function, triggers, and sample data.

    -- For the purpose of this example, let's assume the schema.sql content is here:
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        phone VARCHAR(20),
        date_of_birth DATE,
        profile_image_url TEXT,
        bio TEXT,
        preferences JSONB DEFAULT '{}',
        role VARCHAR(20) DEFAULT 'traveler' CHECK (role IN ('traveler', 'agent', 'admin')),
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS search_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        search_type VARCHAR(20) NOT NULL CHECK (search_type IN ('flight', 'hotel', 'package')),
        search_params JSONB NOT NULL,
        results_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        booking_reference VARCHAR(50) UNIQUE NOT NULL,
        booking_type VARCHAR(20) NOT NULL CHECK (booking_type IN ('flight', 'hotel', 'package')),
        amadeus_booking_id VARCHAR(100),
        booking_data JSONB NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
        payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS flight_cache (
        id SERIAL PRIMARY KEY,
        cache_key VARCHAR(255) UNIQUE NOT NULL,
        search_params JSONB NOT NULL,
        results JSONB NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hotel_cache (
        id SERIAL PRIMARY KEY,
        cache_key VARCHAR(255) UNIQUE NOT NULL,
        search_params JSONB NOT NULL,
        results JSONB NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS locations (
        id SERIAL PRIMARY KEY,
        iata_code VARCHAR(3) UNIQUE,
        icao_code VARCHAR(4),
        name VARCHAR(255) NOT NULL,
        city VARCHAR(100),
        country VARCHAR(100),
        country_code VARCHAR(2),
        type VARCHAR(20) CHECK (type IN ('airport', 'city', 'region')),
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        timezone VARCHAR(50),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pricing_rules (
        id SERIAL PRIMARY KEY,
        rule_name VARCHAR(100) NOT NULL,
        rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('flight', 'hotel', 'package')),
        route_pattern VARCHAR(100),
        markup_type VARCHAR(20) NOT NULL CHECK (markup_type IN ('percentage', 'fixed')),
        markup_value DECIMAL(8,4) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        valid_from DATE,
        valid_to DATE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        favorite_type VARCHAR(20) NOT NULL CHECK (favorite_type IN ('flight', 'hotel', 'destination')),
        favorite_data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS custom_trips (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        trip_name VARCHAR(200) NOT NULL,
        description TEXT,
        destinations JSONB NOT NULL,
        start_date DATE,
        end_date DATE,
        budget_min DECIMAL(10,2),
        budget_max DECIMAL(10,2),
        currency VARCHAR(3) DEFAULT 'USD',
        status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'quoted', 'booked', 'completed')),
        agent_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
        is_read BOOLEAN DEFAULT false,
        action_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
    CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history(created_at);
    CREATE INDEX IF NOT EXISTS idx_search_history_type ON search_history(search_type);
    CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    CREATE INDEX IF NOT EXISTS idx_bookings_reference ON bookings(booking_reference);
    CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at);
    CREATE INDEX IF NOT EXISTS idx_flight_cache_expires_at ON flight_cache(expires_at);
    CREATE INDEX IF NOT EXISTS idx_flight_cache_key ON flight_cache(cache_key);
    CREATE INDEX IF NOT EXISTS idx_hotel_cache_expires_at ON hotel_cache(expires_at);
    CREATE INDEX IF NOT EXISTS idx_hotel_cache_key ON hotel_cache(cache_key);
    CREATE INDEX IF NOT EXISTS idx_locations_iata_code ON locations(iata_code);
    CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);
    CREATE INDEX IF NOT EXISTS idx_locations_country ON locations(country_code);
    CREATE INDEX IF NOT EXISTS idx_pricing_rules_type ON pricing_rules(rule_type);
    CREATE INDEX IF NOT EXISTS idx_pricing_rules_active ON pricing_rules(is_active);
    CREATE INDEX IF NOT EXISTS idx_user_favorites_user_id ON user_favorites(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_favorites_type ON user_favorites(favorite_type);
    CREATE INDEX IF NOT EXISTS idx_custom_trips_user_id ON custom_trips(user_id);
    CREATE INDEX IF NOT EXISTS idx_custom_trips_status ON custom_trips(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);

    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$ language 'plpgsql';

    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_pricing_rules_updated_at BEFORE UPDATE ON pricing_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    CREATE TRIGGER update_custom_trips_updated_at BEFORE UPDATE ON custom_trips FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    INSERT INTO locations (iata_code, icao_code, name, city, country, country_code, type, latitude, longitude, timezone) VALUES
    ('MAD', 'LEMD', 'Adolfo Suárez Madrid-Barajas Airport', 'Madrid', 'Spain', 'ES', 'airport', 40.4719, -3.5626, 'Europe/Madrid'),
    ('BCN', 'LEBL', 'Barcelona-El Prat Airport', 'Barcelona', 'Spain', 'ES', 'airport', 41.2971, 2.0785, 'Europe/Madrid'),
    ('LHR', 'EGLL', 'London Heathrow Airport', 'London', 'United Kingdom', 'GB', 'airport', 51.4700, -0.4543, 'Europe/London'),
    ('CDG', 'LFPG', 'Charles de Gaulle Airport', 'Paris', 'France', 'FR', 'airport', 49.0097, 2.5479, 'Europe/Paris'),
    ('FCO', 'LIRF', 'Leonardo da Vinci International Airport', 'Rome', 'Italy', 'IT', 'airport', 41.8003, 12.2389, 'Europe/Rome'),
    ('JFK', 'KJFK', 'John F. Kennedy International Airport', 'New York', 'United States', 'US', 'airport', 40.6413, -73.7781, 'America/New_York'),
    ('LAX', 'KLAX', 'Los Angeles International Airport', 'Los Angeles', 'United States', 'US', 'airport', 33.9425, -118.4081, 'America/Los_Angeles'),
    ('NRT', 'RJAA', 'Narita International Airport', 'Tokyo', 'Japan', 'JP', 'airport', 35.7720, 140.3929, 'Asia/Tokyo'),
    ('SIN', 'WSSS', 'Singapore Changi Airport', 'Singapore', 'Singapore', 'SG', 'airport', 1.3644, 103.9915, 'Asia/Singapore'),
    ('DXB', 'OMDB', 'Dubai International Airport', 'Dubai', 'United Arab Emirates', 'AE', 'airport', 25.2532, 55.3657, 'Asia/Dubai')
    ON CONFLICT (iata_code) DO NOTHING;

    INSERT INTO pricing_rules (rule_name, rule_type, route_pattern, markup_type, markup_value, currency, is_active) VALUES
    ('Default Flight Markup', 'flight', '*', 'percentage', 5.0, 'USD', true),
    ('Default Hotel Markup', 'hotel', '*', 'percentage', 10.0, 'USD', true)
    ON CONFLICT DO NOTHING;
  `);
};

exports.down = pgm => {
  // The `down` migration should revert the changes made by `up`.
  // This means dropping tables, functions, triggers, and extensions in the reverse order of creation,
  // considering dependencies. Using `CASCADE` can help with dependencies like indexes.

  pgm.sql(`
    -- Drop Triggers (order doesn't strictly matter among these, but good to be explicit)
    DROP TRIGGER IF EXISTS update_custom_trips_updated_at ON custom_trips;
    DROP TRIGGER IF EXISTS update_pricing_rules_updated_at ON pricing_rules;
    DROP TRIGGER IF EXISTS update_bookings_updated_at ON bookings;
    DROP TRIGGER IF EXISTS update_users_updated_at ON users;

    -- Drop Function
    DROP FUNCTION IF EXISTS update_updated_at_column();

    -- Drop Tables (in reverse order of creation or dependency)
    -- Note: Indexes are typically dropped automatically when the table is dropped.
    -- Using CASCADE will also drop dependent objects like foreign key constraints.
    DROP TABLE IF EXISTS notifications CASCADE;
    DROP TABLE IF EXISTS custom_trips CASCADE;
    DROP TABLE IF EXISTS user_favorites CASCADE;
    DROP TABLE IF EXISTS pricing_rules CASCADE;
    DROP TABLE IF EXISTS locations CASCADE;
    DROP TABLE IF EXISTS hotel_cache CASCADE;
    DROP TABLE IF EXISTS flight_cache CASCADE;
    DROP TABLE IF EXISTS bookings CASCADE;
    DROP TABLE IF EXISTS search_history CASCADE;
    DROP TABLE IF EXISTS users CASCADE;

    -- Drop Extension
    DROP EXTENSION IF EXISTS "uuid-ossp";
  `);
};
