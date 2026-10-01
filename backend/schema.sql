-- ==============================================================================
-- NetTopology Enterprise - PostgreSQL Complete Relational Schema
-- Version: 1.47.0
-- Handles Users, RBAC, Active Directory, Devices, Topology, Hierarchy, Custom Maps, Logs, Sessions
-- ==============================================================================

-- 1. Users Table (Local and Active Directory Accounts)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(64) NOT NULL,
    full_name VARCHAR(128) NOT NULL,
    email VARCHAR(128) NOT NULL,
    role VARCHAR(64) NOT NULL DEFAULT 'Super Administrator',
    user_type VARCHAR(32) NOT NULL DEFAULT 'local', -- 'local' | 'ad'
    status VARCHAR(32) NOT NULL DEFAULT 'active',   -- 'active' | 'disabled'
    group_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- Ensure migration for users existing columns
DO $$ BEGIN
    ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(128) DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(128) DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(64) DEFAULT 'Super Administrator';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(32) DEFAULT 'local';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'active';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS group_ids JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_builtin BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Local User Groups / Roles
CREATE TABLE IF NOT EXISTS user_groups (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    color VARCHAR(32) DEFAULT 'indigo',
    member_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Granular Access Policies (RBAC)
CREATE TABLE IF NOT EXISTS access_policies (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    priority INT NOT NULL DEFAULT 100,
    is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
    policy_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Network Devices
CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    ip VARCHAR(64) NOT NULL,
    type VARCHAR(64) NOT NULL DEFAULT 'switch',
    model VARCHAR(128) DEFAULT 'Cisco Catalyst 2960X',
    platform VARCHAR(64) DEFAULT 'cisco_ios_xe',
    role VARCHAR(64) DEFAULT 'Access Switch',
    connection_mode VARCHAR(32) DEFAULT 'ssh',
    connection_protocol VARCHAR(32) DEFAULT 'ssh',
    ssh_host VARCHAR(64),
    ssh_port INT DEFAULT 22,
    winbox_port INT DEFAULT 8291,
    ssh_username VARCHAR(64) DEFAULT 'admin',
    ssh_password VARCHAR(128),
    enable_password VARCHAR(128),
    connection_data JSONB DEFAULT '{}'::jsonb,
    ports JSONB DEFAULT '[]'::jsonb,
    is_online BOOLEAN DEFAULT TRUE,
    latency_ms FLOAT DEFAULT 1.5,
    mac_address VARCHAR(32),
    serial_number VARCHAR(64),
    uptime_str VARCHAR(64),
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip);
CREATE INDEX IF NOT EXISTS idx_devices_platform ON devices(platform);

-- 5. Device Groups (E.g. Core, Helpdesk, Branch)
CREATE TABLE IF NOT EXISTS device_groups (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    color VARCHAR(32) DEFAULT 'indigo',
    icon VARCHAR(64) DEFAULT 'Server',
    device_ids JSONB DEFAULT '[]'::jsonb,
    server_ids JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Custom Schematic & Physical Maps
CREATE TABLE IF NOT EXISTS custom_maps (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    map_type VARCHAR(32) DEFAULT 'schematic',
    building_id VARCHAR(64),
    floor_id VARCHAR(64),
    unit_id VARCHAR(64),
    rack_id VARCHAR(64),
    nodes JSONB DEFAULT '[]'::jsonb,
    connections JSONB DEFAULT '[]'::jsonb,
    viewport JSONB DEFAULT '{"zoom": 1, "pan": {"x": 0, "y": 0}}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    visibility VARCHAR(32) DEFAULT 'public', -- 'public' | 'private' | 'restricted'
    owner_id VARCHAR(64) DEFAULT 'user-admin',
    owner_name VARCHAR(128) DEFAULT 'admin',
    allowed_users JSONB DEFAULT '[]'::jsonb,
    map_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure migration for custom_maps existing columns
DO $$ BEGIN
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS map_type VARCHAR(32) DEFAULT 'schematic';
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS building_id VARCHAR(64);
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS floor_id VARCHAR(64);
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS unit_id VARCHAR(64);
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS rack_id VARCHAR(64);
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS nodes JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS connections JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS viewport JSONB DEFAULT '{"zoom": 1, "pan": {"x": 0, "y": 0}}'::jsonb;
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS visibility VARCHAR(32) DEFAULT 'public';
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS owner_id VARCHAR(64) DEFAULT 'user-admin';
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS owner_name VARCHAR(128) DEFAULT 'admin';
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS allowed_users JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS map_data JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE custom_maps ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 7. Topology Structural Hierarchy (Buildings, Floors, Units, Racks)
CREATE TABLE IF NOT EXISTS topology_hierarchy (
    id VARCHAR(64) PRIMARY KEY,
    type VARCHAR(32) NOT NULL, -- 'building' | 'floor' | 'unit' | 'rack'
    parent_id VARCHAR(64),
    name VARCHAR(128) NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hierarchy_type ON topology_hierarchy(type);
CREATE INDEX IF NOT EXISTS idx_hierarchy_parent ON topology_hierarchy(parent_id);

-- 8. Node Positions on Canvas
CREATE TABLE IF NOT EXISTS node_positions (
    map_id VARCHAR(64) NOT NULL DEFAULT 'default',
    node_id VARCHAR(64) NOT NULL,
    x FLOAT NOT NULL,
    y FLOAT NOT NULL,
    PRIMARY KEY (map_id, node_id)
);

-- 9. Comprehensive Audit, Security, & Command Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_name VARCHAR(64) NOT NULL,
    action VARCHAR(128) NOT NULL,
    category VARCHAR(64) DEFAULT 'security',
    target VARCHAR(128),
    status VARCHAR(32) DEFAULT 'success', -- 'success' | 'warning' | 'error' | 'info'
    details TEXT,
    ip_address VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_name);

-- 10. Active Directory Configuration
CREATE TABLE IF NOT EXISTS ad_config (
    id VARCHAR(32) PRIMARY KEY DEFAULT 'primary',
    config_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. User Auth Sessions & Revocation Tokens
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(64),
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 12. Device Sticky Notes (Schematic Map & Inventory Integration)
CREATE TABLE IF NOT EXISTS device_sticky_notes (
    id VARCHAR(128) PRIMARY KEY,
    device_id VARCHAR(128) NOT NULL,
    title VARCHAR(255),
    content TEXT,
    color VARCHAR(32) DEFAULT 'yellow',
    x NUMERIC DEFAULT 100,
    y NUMERIC DEFAULT 100,
    width NUMERIC DEFAULT 230,
    view_mode VARCHAR(32) DEFAULT 'card',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device_sticky_notes_dev ON device_sticky_notes(device_id);

-- 13. Remote Servers Fleet (Linux & Windows Host Management with Categorization & Automation Tags)
CREATE TABLE IF NOT EXISTS remote_servers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    hostname VARCHAR(128),
    ip VARCHAR(64) NOT NULL,
    os_type VARCHAR(32) NOT NULL DEFAULT 'linux', -- 'linux' | 'windows'
    os_distro VARCHAR(64) DEFAULT 'Ubuntu 24.04 LTS',
    environment VARCHAR(64) DEFAULT 'Production', -- 'Production' | 'Staging' | 'Development' | 'Testing' | 'DMZ' | 'DR'
    category VARCHAR(64) DEFAULT 'Application Server',
    role VARCHAR(64) DEFAULT 'Web & API Backend',
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    ssh_port INT DEFAULT 22,
    ssh_username VARCHAR(64) DEFAULT 'root',
    ssh_password VARCHAR(255),
    ssh_key_path VARCHAR(255),
    default_shell VARCHAR(32) DEFAULT 'bash', -- 'bash' | 'zsh' | 'sh'
    win_protocol VARCHAR(32) DEFAULT 'rdp', -- 'rdp' | 'powershell' | 'winrm'
    win_port INT DEFAULT 3389,
    win_username VARCHAR(64) DEFAULT 'Administrator',
    win_domain VARCHAR(64) DEFAULT 'CORP.INTERNAL',
    status VARCHAR(32) DEFAULT 'untested', -- 'online' | 'offline' | 'unreachable' | 'untested'
    cpu_cores INT,
    ram_gb NUMERIC,
    disk_gb INT,
    uptime_str VARCHAR(64) DEFAULT '',
    location VARCHAR(128) DEFAULT 'Datacenter A (Rack R-04)',
    notes TEXT,
    prompt_password_on_connect BOOLEAN DEFAULT FALSE,
    installed_web_servers JSONB NOT NULL DEFAULT '[]'::jsonb,
    installed_databases JSONB NOT NULL DEFAULT '[]'::jsonb,
    has_apache BOOLEAN DEFAULT FALSE,
    has_nginx BOOLEAN DEFAULT FALSE,
    has_postgresql BOOLEAN DEFAULT FALSE,
    has_mysql BOOLEAN DEFAULT FALSE,
    postgres_port INT DEFAULT 5432,
    postgres_user VARCHAR(64) DEFAULT 'postgres',
    postgres_password TEXT DEFAULT '',
    postgres_database VARCHAR(64) DEFAULT 'postgres',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS prompt_password_on_connect BOOLEAN DEFAULT FALSE;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS installed_web_servers JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS installed_databases JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_apache BOOLEAN DEFAULT FALSE;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_nginx BOOLEAN DEFAULT FALSE;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_postgresql BOOLEAN DEFAULT FALSE;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS has_mysql BOOLEAN DEFAULT FALSE;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_port INT DEFAULT 5432;
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_user VARCHAR(64) DEFAULT 'postgres';
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_password TEXT DEFAULT '';
ALTER TABLE remote_servers ADD COLUMN IF NOT EXISTS postgres_database VARCHAR(64) DEFAULT 'postgres';

CREATE INDEX IF NOT EXISTS idx_remote_servers_os_type ON remote_servers(os_type);
CREATE INDEX IF NOT EXISTS idx_remote_servers_environment ON remote_servers(environment);
CREATE INDEX IF NOT EXISTS idx_remote_servers_category ON remote_servers(category);
CREATE INDEX IF NOT EXISTS idx_remote_servers_ip ON remote_servers(ip);

-- 14. Server Categories (Dynamic Fleet Grouping with Localization & Color Badging)
CREATE TABLE IF NOT EXISTS server_categories (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    name_fa VARCHAR(150),
    description TEXT,
    color VARCHAR(50) DEFAULT 'indigo',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_server_categories_name ON server_categories(name);

-- 15. User Password Vault (Per-User Isolated Encrypted Credentials)
CREATE TABLE IF NOT EXISTS user_password_vault (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    name VARCHAR(150) NOT NULL,
    username VARCHAR(128),
    encrypted_password TEXT NOT NULL,
    iv VARCHAR(64) NOT NULL,
    tag VARCHAR(64) NOT NULL,
    password_hash VARCHAR(128),
    password_salt VARCHAR(64),
    category VARCHAR(64) DEFAULT 'general',
    target_host VARCHAR(150),
    notes TEXT,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    strength VARCHAR(32) DEFAULT 'strong',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_vault_user_id ON user_password_vault(user_id);
CREATE INDEX IF NOT EXISTS idx_user_vault_category ON user_password_vault(category);

-- Ensure migration for user_password_vault hash columns
DO $$ BEGIN
    ALTER TABLE user_password_vault ADD COLUMN IF NOT EXISTS password_hash VARCHAR(128);
    ALTER TABLE user_password_vault ADD COLUMN IF NOT EXISTS password_salt VARCHAR(64);
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Dynamic Alterations for Seamless Upgrades
ALTER TABLE devices ADD COLUMN IF NOT EXISTS winbox_port INT DEFAULT 8291;

-- 16. Bulk Server Execution Reports & Fleet Audit History
CREATE TABLE IF NOT EXISTS bulk_server_reports (
    id VARCHAR(128) PRIMARY KEY,
    job_id VARCHAR(128) NOT NULL,
    template_id VARCHAR(128) NOT NULL,
    template_title VARCHAR(255) NOT NULL,
    template_title_en VARCHAR(255),
    category VARCHAR(100),
    icon VARCHAR(50),
    status VARCHAR(50) NOT NULL,
    operator_user VARCHAR(128) DEFAULT 'Administrator',
    duration_ms INTEGER DEFAULT 0,
    total_servers INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,
    server_summaries JSONB NOT NULL DEFAULT '[]'::jsonb,
    impact_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    results JSONB NOT NULL DEFAULT '{}'::jsonb,
    logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at BIGINT NOT NULL,
    finished_at BIGINT NOT NULL,
    created_at_dt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at_dt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_created ON bulk_server_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_template ON bulk_server_reports(template_id);
CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_status ON bulk_server_reports(status);
CREATE INDEX IF NOT EXISTS idx_bulk_server_reports_job_id ON bulk_server_reports(job_id);


