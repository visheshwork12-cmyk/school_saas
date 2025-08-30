#!/bin/bash
# Database Migration Script for School ERP SaaS

set -euo pipefail

# Script metadata
SCRIPT_NAME="migrate.sh"
SCRIPT_VERSION="2.0.0"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Configuration
ENVIRONMENT=${1:-production}
MIGRATION_TYPE=${2:-up}
DRY_RUN=${DRY_RUN:-false}
FORCE=${FORCE:-false}
BACKUP_BEFORE_MIGRATION=${BACKUP_BEFORE_MIGRATION:-true}
LOG_FILE="/tmp/migration-$(date +%Y%m%d-%H%M%S).log"
MIGRATION_DIR="$PROJECT_ROOT/src/infrastructure/database/mongodb/migrations"
BACKUP_DIR="$PROJECT_ROOT/backups/database"
LOCK_FILE="/tmp/migration.lock"

# Arrays
declare -a VALID_ENVIRONMENTS=("development" "staging" "production" "local")
declare -a VALID_MIGRATION_TYPES=("up" "down" "status" "reset" "seed")
declare -A MIGRATION_STATUS

# Functions
log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)  echo -e "${GREEN}[INFO]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        DEBUG) [[ "${DEBUG:-}" == "true" ]] && echo -e "${BLUE}[DEBUG]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        STEP)  echo -e "${CYAN}[STEP]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        SUCCESS) echo -e "${GREEN}[✅]${NC} ${message}" | tee -a "$LOG_FILE" ;;
        *) echo -e "${message}" | tee -a "$LOG_FILE" ;;
    esac
}

print_banner() {
    echo -e "${CYAN}"
    cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║               🗄️  DATABASE MIGRATION MANAGER                ║
║             School ERP SaaS - Schema & Data Sync            ║
╚══════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
    echo "Environment: $ENVIRONMENT"
    echo "Migration Type: $MIGRATION_TYPE"
    echo "Dry Run: $DRY_RUN"
    echo "Log File: $LOG_FILE"
    echo ""
}

usage() {
    cat << EOF
Usage: $0 [environment] [migration_type] [options]

ARGUMENTS:
    environment       Target environment (development|staging|production|local)
    migration_type    Migration operation (up|down|status|reset|seed)

MIGRATION TYPES:
    up               Run pending migrations (default)
    down             Rollback last migration
    status           Show migration status
    reset            Reset database and run all migrations
    seed             Run database seeders

OPTIONS:
    --dry-run        Simulate migration without applying changes
    --force          Force migration without confirmation
    --no-backup      Skip backup before migration
    --target N       Migrate to specific version N
    --debug          Enable debug logging
    --help           Show this help message

EXAMPLES:
    $0 production up
    $0 staging down --force
    $0 development reset --no-backup
    $0 production status
    $0 staging seed --dry-run

ENVIRONMENT VARIABLES:
    DRY_RUN                     Perform dry run (true/false)
    FORCE                       Force migration (true/false)
    BACKUP_BEFORE_MIGRATION     Backup before migration (true/false)
    MONGODB_URI                 MongoDB connection string
    DEBUG                       Enable debug mode (true/false)
EOF
}

acquire_lock() {
    if [[ -f "$LOCK_FILE" ]]; then
        local lock_pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        if [[ -n "$lock_pid" ]] && kill -0 "$lock_pid" 2>/dev/null; then
            log ERROR "Migration already in progress (PID: $lock_pid)"
            exit 1
        else
            log WARN "Removing stale lock file"
            rm -f "$LOCK_FILE"
        fi
    fi
    
    echo $$ > "$LOCK_FILE"
    log DEBUG "Acquired migration lock (PID: $$)"
}

release_lock() {
    if [[ -f "$LOCK_FILE" ]]; then
        rm -f "$LOCK_FILE"
        log DEBUG "Released migration lock"
    fi
}

load_environment_config() {
    log STEP "🔧 Loading environment configuration..."
    
    # Load environment-specific configuration
    local env_file="$PROJECT_ROOT/.env.$ENVIRONMENT"
    if [[ -f "$env_file" ]]; then
        log INFO "Loading environment file: $env_file"
        set -a
        source "$env_file"
        set +a
    else
        log WARN "Environment file not found: $env_file"
    fi
    
    # Set MongoDB URI if not provided
    if [[ -z "${MONGODB_URI:-}" ]]; then
        case $ENVIRONMENT in
            production)
                log ERROR "MONGODB_URI must be set for production environment"
                exit 1
                ;;
            staging)
                MONGODB_URI="mongodb://localhost:27017/school-erp-staging"
                ;;
            development)
                MONGODB_URI="mongodb://localhost:27017/school-erp-dev"
                ;;
            local)
                MONGODB_URI="mongodb://localhost:27017/school-erp-local"
                ;;
        esac
    fi
    
    log INFO "MongoDB URI: ${MONGODB_URI%/*}/[database]"
    
    # Set Node.js environment
    export NODE_ENV="$ENVIRONMENT"
}

check_prerequisites() {
    log STEP "🔍 Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log ERROR "Node.js is not installed or not in PATH"
        exit 1
    fi
    
    # Check MongoDB connection
    if ! node -e "
        const { MongoClient } = require('mongodb');
        const client = new MongoClient('$MONGODB_URI');
        client.connect().then(() => {
            console.log('MongoDB connection successful');
            client.close();
        }).catch(err => {
            console.error('MongoDB connection failed:', err.message);
            process.exit(1);
        });
    " 2>&1; then
        log ERROR "Cannot connect to MongoDB at $MONGODB_URI"
        exit 1
    fi
    
    # Check migration directory
    if [[ ! -d "$MIGRATION_DIR" ]]; then
        log ERROR "Migration directory not found: $MIGRATION_DIR"
        exit 1
    fi
    
    log SUCCESS "✅ Prerequisites check passed"
}

create_migration_table() {
    log INFO "📋 Ensuring migration tracking collection exists..."
    
    node -e "
        const { MongoClient } = require('mongodb');
        
        async function createMigrationCollection() {
            const client = new MongoClient('$MONGODB_URI');
            
            try {
                await client.connect();
                const db = client.db();
                
                // Create migrations collection if it doesn't exist
                const collections = await db.listCollections({name: 'migrations'}).toArray();
                if (collections.length === 0) {
                    await db.createCollection('migrations');
                    console.log('Created migrations collection');
                    
                    // Create index on version field
                    await db.collection('migrations').createIndex({version: 1}, {unique: true});
                    console.log('Created index on version field');
                }
                
                await client.close();
            } catch (error) {
                console.error('Error creating migration collection:', error);
                process.exit(1);
            }
        }
        
        createMigrationCollection();
    "
}

backup_database() {
    if [[ "$BACKUP_BEFORE_MIGRATION" != "true" ]]; then
        log INFO "⏭️ Skipping database backup (--no-backup enabled)"
        return 0
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would create database backup"
        return 0
    fi
    
    log STEP "💾 Creating database backup..."
    
    local backup_timestamp=$(date +%Y%m%d-%H%M%S)
    local backup_name="migration-backup-$ENVIRONMENT-$backup_timestamp"
    local backup_path="$BACKUP_DIR/$backup_name"
    
    mkdir -p "$BACKUP_DIR"
    
    # Extract database name from MongoDB URI
    local db_name=$(echo "$MONGODB_URI" | sed 's/.*\/\([^?]*\).*/\1/')
    
    if command -v mongodump &> /dev/null; then
        log INFO "Using mongodump for backup..."
        mongodump --uri "$MONGODB_URI" --out "$backup_path" || {
            log ERROR "Database backup failed"
            exit 1
        }
    else
        log INFO "Using Node.js for backup..."
        node -e "
            const { MongoClient } = require('mongodb');
            const fs = require('fs');
            
            async function backupDatabase() {
                const client = new MongoClient('$MONGODB_URI');
                
                try {
                    await client.connect();
                    const db = client.db();
                    
                    const collections = await db.listCollections().toArray();
                    const backup = {
                        timestamp: new Date(),
                        collections: {}
                    };
                    
                    for (const collInfo of collections) {
                        const collName = collInfo.name;
                        if (collName.startsWith('system.')) continue;
                        
                        console.log('Backing up collection:', collName);
                        const data = await db.collection(collName).find({}).toArray();
                        backup.collections[collName] = data;
                    }
                    
                    fs.mkdirSync('$backup_path', {recursive: true});
                    fs.writeFileSync('$backup_path/backup.json', JSON.stringify(backup, null, 2));
                    console.log('Backup completed:', '$backup_path/backup.json');
                    
                    await client.close();
                } catch (error) {
                    console.error('Backup failed:', error);
                    process.exit(1);
                }
            }
            
            backupDatabase();
        " || {
            log ERROR "Database backup failed"
            exit 1
        }
    fi
    
    log SUCCESS "✅ Database backup created: $backup_path"
}

get_migration_status() {
    log INFO "📊 Checking migration status..."
    
    # Get applied migrations from database
    local applied_migrations=$(node -e "
        const { MongoClient } = require('mongodb');
        
        async function getAppliedMigrations() {
            const client = new MongoClient('$MONGODB_URI');
            
            try {
                await client.connect();
                const db = client.db();
                
                const migrations = await db.collection('migrations')
                    .find({}, {projection: {version: 1, appliedAt: 1}})
                    .sort({version: 1})
                    .toArray();
                
                migrations.forEach(m => console.log(m.version + ':' + m.appliedAt));
                await client.close();
            } catch (error) {
                // Migration collection might not exist yet
                console.log('No migrations applied yet');
                await client.close();
            }
        }
        
        getAppliedMigrations();
    ")
    
    # Get available migrations from filesystem
    local available_migrations=()
    if [[ -d "$MIGRATION_DIR" ]]; then
        while IFS= read -r -d '' file; do
            local filename=$(basename "$file")
            if [[ "$filename" =~ ^[0-9]{14}_.*\.js$ ]]; then
                local version=$(echo "$filename" | cut -d'_' -f1)
                available_migrations+=("$version")
            fi
        done < <(find "$MIGRATION_DIR" -name "*.js" -print0 | sort -z)
    fi
    
    # Compare and build status
    echo -e "\n${CYAN}📋 Migration Status:${NC}"
    echo "Environment: $ENVIRONMENT"
    echo "Database: $(echo "$MONGODB_URI" | sed 's/.*\/\([^?]*\).*/\1/')"
    echo ""
    
    local pending_count=0
    local applied_count=0
    
    for version in "${available_migrations[@]}"; do
        local migration_file=$(find "$MIGRATION_DIR" -name "${version}_*.js" | head -1)
        local migration_name=$(basename "$migration_file" .js | cut -d'_' -f2-)
        
        if echo "$applied_migrations" | grep -q "^$version:"; then
            local applied_at=$(echo "$applied_migrations" | grep "^$version:" | cut -d':' -f2-)
            echo -e "${GREEN}✅${NC} $version $migration_name (Applied: $applied_at)"
            applied_count=$((applied_count + 1))
            MIGRATION_STATUS["$version"]="applied"
        else
            echo -e "${YELLOW}⏳${NC} $version $migration_name (Pending)"
            pending_count=$((pending_count + 1))
            MIGRATION_STATUS["$version"]="pending"
        fi
    done
    
    echo ""
    echo "Applied: $applied_count"
    echo "Pending: $pending_count"
    echo ""
}

run_migrations_up() {
    log STEP "⬆️ Running pending migrations..."
    
    local pending_migrations=()
    
    # Find pending migrations
    for version in "${!MIGRATION_STATUS[@]}"; do
        if [[ "${MIGRATION_STATUS[$version]}" == "pending" ]]; then
            pending_migrations+=("$version")
        fi
    done
    
    if [[ ${#pending_migrations[@]} -eq 0 ]]; then
        log INFO "No pending migrations found"
        return 0
    fi
    
    # Sort migrations by version
    IFS=$'\n' pending_migrations=($(sort <<<"${pending_migrations[*]}"))
    
    log INFO "Found ${#pending_migrations[@]} pending migration(s)"
    
    for version in "${pending_migrations[@]}"; do
        local migration_file=$(find "$MIGRATION_DIR" -name "${version}_*.js" | head -1)
        local migration_name=$(basename "$migration_file" .js)
        
        log INFO "Running migration: $migration_name"
        
        if [[ "$DRY_RUN" == "true" ]]; then
            log INFO "🧪 DRY RUN: Would apply migration $migration_name"
            continue
        fi
        
        # Run migration
        if node -e "
            const migration = require('$migration_file');
            const { MongoClient } = require('mongodb');
            
            async function runMigration() {
                const client = new MongoClient('$MONGODB_URI');
                
                try {
                    await client.connect();
                    const db = client.db();
                    
                    console.log('Applying migration: $migration_name');
                    
                    if (typeof migration.up === 'function') {
                        await migration.up(db);
                    } else {
                        throw new Error('Migration file must export an \"up\" function');
                    }
                    
                    // Record migration as applied
                    await db.collection('migrations').insertOne({
                        version: '$version',
                        name: '$migration_name',
                        appliedAt: new Date(),
                        checksum: 'TODO' // Could add checksum validation
                    });
                    
                    console.log('Migration applied successfully');
                    await client.close();
                } catch (error) {
                    console.error('Migration failed:', error);
                    await client.close();
                    process.exit(1);
                }
            }
            
            runMigration();
        "; then
            log SUCCESS "✅ Migration applied: $migration_name"
        else
            log ERROR "❌ Migration failed: $migration_name"
            exit 1
        fi
    done
    
    log SUCCESS "✅ All migrations completed successfully"
}

run_migrations_down() {
    log STEP "⬇️ Rolling back last migration..."
    
    # Get last applied migration
    local last_migration=$(node -e "
        const { MongoClient } = require('mongodb');
        
        async function getLastMigration() {
            const client = new MongoClient('$MONGODB_URI');
            
            try {
                await client.connect();
                const db = client.db();
                
                const migration = await db.collection('migrations')
                    .findOne({}, {sort: {version: -1}});
                
                if (migration) {
                    console.log(migration.version + ':' + migration.name);
                } else {
                    console.log('No migrations to rollback');
                }
                
                await client.close();
            } catch (error) {
                console.error('Error getting last migration:', error);
                await client.close();
                process.exit(1);
            }
        }
        
        getLastMigration();
    ")
    
    if [[ "$last_migration" == "No migrations to rollback" ]]; then
        log INFO "No migrations to rollback"
        return 0
    fi
    
    local version=$(echo "$last_migration" | cut -d':' -f1)
    local name=$(echo "$last_migration" | cut -d':' -f2)
    
    log INFO "Rolling back migration: $name (version: $version)"
    
    # Confirmation for rollback
    if [[ "$FORCE" != "true" ]] && [[ "$DRY_RUN" != "true" ]]; then
        read -p "Are you sure you want to rollback migration $name? (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log INFO "Rollback cancelled"
            return 0
        fi
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would rollback migration $name"
        return 0
    fi
    
    # Find migration file
    local migration_file=$(find "$MIGRATION_DIR" -name "${version}_*.js" | head -1)
    
    if [[ ! -f "$migration_file" ]]; then
        log ERROR "Migration file not found for version: $version"
        exit 1
    fi
    
    # Run rollback
    if node -e "
        const migration = require('$migration_file');
        const { MongoClient } = require('mongodb');
        
        async function rollbackMigration() {
            const client = new MongoClient('$MONGODB_URI');
            
            try {
                await client.connect();
                const db = client.db();
                
                console.log('Rolling back migration: $name');
                
                if (typeof migration.down === 'function') {
                    await migration.down(db);
                } else {
                    throw new Error('Migration file must export a \"down\" function for rollback');
                }
                
                // Remove migration record
                await db.collection('migrations').deleteOne({version: '$version'});
                
                console.log('Migration rollback completed');
                await client.close();
            } catch (error) {
                console.error('Rollback failed:', error);
                await client.close();
                process.exit(1);
            }
        }
        
        rollbackMigration();
    "; then
        log SUCCESS "✅ Migration rolled back: $name"
    else
        log ERROR "❌ Migration rollback failed: $name"
        exit 1
    fi
}

reset_database() {
    log STEP "🔄 Resetting database..."
    
    # Confirmation for reset
    if [[ "$FORCE" != "true" ]] && [[ "$DRY_RUN" != "true" ]]; then
        log WARN "⚠️ This will DROP ALL DATA in the database!"
        read -p "Are you sure you want to reset the database? Type 'reset' to confirm: " -r
        if [[ "$REPLY" != "reset" ]]; then
            log INFO "Database reset cancelled"
            return 0
        fi
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would reset database and apply all migrations"
        return 0
    fi
    
    # Drop all collections except system collections
    node -e "
        const { MongoClient } = require('mongodb');
        
        async function resetDatabase() {
            const client = new MongoClient('$MONGODB_URI');
            
            try {
                await client.connect();
                const db = client.db();
                
                // Get all collections
                const collections = await db.listCollections().toArray();
                
                // Drop all non-system collections
                for (const collInfo of collections) {
                    const collName = collInfo.name;
                    if (!collName.startsWith('system.')) {
                        console.log('Dropping collection:', collName);
                        await db.collection(collName).drop();
                    }
                }
                
                console.log('Database reset completed');
                await client.close();
            } catch (error) {
                console.error('Database reset failed:', error);
                await client.close();
                process.exit(1);
            }
        }
        
        resetDatabase();
    "
    
    log SUCCESS "✅ Database reset completed"
    
    # Recreate migration table and run all migrations
    create_migration_table
    get_migration_status
    run_migrations_up
}

run_seeds() {
    log STEP "🌱 Running database seeders..."
    
    local seed_dir="$PROJECT_ROOT/src/infrastructure/database/seeds"
    
    if [[ ! -d "$seed_dir" ]]; then
        log WARN "Seed directory not found: $seed_dir"
        return 0
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log INFO "🧪 DRY RUN: Would run database seeders"
        return 0
    fi
    
    # Find and run seed files
    local seed_files=()
    while IFS= read -r -d '' file; do
        seed_files+=("$file")
    done < <(find "$seed_dir" -name "*.js" -print0 | sort -z)
    
    if [[ ${#seed_files[@]} -eq 0 ]]; then
        log INFO "No seed files found"
        return 0
    fi
    
    for seed_file in "${seed_files[@]}"; do
        local seed_name=$(basename "$seed_file" .js)
        
        log INFO "Running seeder: $seed_name"
        
        if node -e "
            const seeder = require('$seed_file');
            const { MongoClient } = require('mongodb');
            
            async function runSeeder() {
                const client = new MongoClient('$MONGODB_URI');
                
                try {
                    await client.connect();
                    const db = client.db();
                    
                    if (typeof seeder.run === 'function') {
                        await seeder.run(db);
                        console.log('Seeder completed: $seed_name');
                    } else {
                        console.log('Seeder must export a \"run\" function');
                    }
                    
                    await client.close();
                } catch (error) {
                    console.error('Seeder failed:', error);
                    await client.close();
                    process.exit(1);
                }
            }
            
            runSeeder();
        "; then
            log SUCCESS "✅ Seeder completed: $seed_name"
        else
            log ERROR "❌ Seeder failed: $seed_name"
            exit 1
        fi
    done
    
    log SUCCESS "✅ All seeders completed"
}

cleanup() {
    local exit_code=$?
    
    release_lock
    
    if [[ $exit_code -eq 0 ]]; then
        log SUCCESS "✅ Migration process completed successfully"
    else
        log ERROR "❌ Migration process failed with exit code $exit_code"
        log INFO "📝 Check log file: $LOG_FILE"
    fi
    
    exit $exit_code
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --no-backup)
            BACKUP_BEFORE_MIGRATION=false
            shift
            ;;
        --target)
            TARGET_VERSION="$2"
            shift 2
            ;;
        --debug)
            DEBUG=true
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            if [[ -z "${ENVIRONMENT_SET:-}" ]]; then
                ENVIRONMENT=$1
                ENVIRONMENT_SET=true
            elif [[ "$MIGRATION_TYPE" == "up" ]]; then
                MIGRATION_TYPE=$1
            else
                log ERROR "Unknown argument: $1"
                usage
                exit 1
            fi
            shift
            ;;
    esac
done

# Main execution
main() {
    trap cleanup EXIT
    
    print_banner
    
    # Validation
    if [[ ! " ${VALID_ENVIRONMENTS[*]} " =~ " $ENVIRONMENT " ]]; then
        log ERROR "Invalid environment: $ENVIRONMENT"
        log INFO "Valid environments: ${VALID_ENVIRONMENTS[*]}"
        exit 1
    fi
    
    if [[ ! " ${VALID_MIGRATION_TYPES[*]} " =~ " $MIGRATION_TYPE " ]]; then
        log ERROR "Invalid migration type: $MIGRATION_TYPE"
        log INFO "Valid types: ${VALID_MIGRATION_TYPES[*]}"
        exit 1
    fi
    
    # Acquire migration lock
    acquire_lock
    
    # Execute migration pipeline
    load_environment_config
    check_prerequisites
    create_migration_table
    
    case $MIGRATION_TYPE in
        status)
            get_migration_status
            ;;
        up)
            backup_database
            get_migration_status
            run_migrations_up
            ;;
        down)
            backup_database
            run_migrations_down
            ;;
        reset)
            backup_database
            reset_database
            ;;
        seed)
            run_seeds
            ;;
    esac
    
    log SUCCESS "🎉 Migration operation '$MIGRATION_TYPE' completed successfully!"
}

# Run main function
main "$@"
