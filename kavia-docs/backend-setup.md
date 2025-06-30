# BookSwap+ Backend Setup Guide

This guide provides comprehensive instructions for setting up and configuring the BookSwap+ backend system, including all external service integrations, environment configuration, and validation steps.

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Python Environment Setup](#python-environment-setup)
3. [Supabase/PostgreSQL Configuration](#supabasepostgresql-configuration)
4. [Clerk.dev Integration](#clerkdev-integration)
5. [Environment Variables](#environment-variables)
6. [Database Initialization](#database-initialization)
7. [Running the Backend](#running-the-backend)
8. [Integration Testing](#integration-testing)
9. [Development Best Practices](#development-best-practices)
10. [Phase Validation](#phase-validation)

## Prerequisites

Before starting, ensure you have:
- Python 3.8 or higher installed
- pip (Python package manager)
- PostgreSQL client (for database access)
- Access to Supabase and Clerk.dev accounts
- Git (for version control)

## Python Environment Setup

1. Create and activate a virtual environment:
   ```bash
   # Create virtual environment
   python -m venv venv

   # Activate virtual environment
   # On Windows:
   .\venv\Scripts\activate
   # On Unix/MacOS:
   source venv/bin/activate
   ```

2. Install required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

Key dependencies include:
- FastAPI and Uvicorn for the web framework
- SQLAlchemy for database ORM
- python-jose for JWT handling
- httpx for async HTTP requests
- python-dotenv for environment management

## Supabase/PostgreSQL Configuration

1. Create a Supabase project:
   - Go to [Supabase Dashboard](https://app.supabase.com)
   - Create a new project
   - Note down the project URL and API keys

2. Get your database connection details:
   - In Supabase dashboard, go to Project Settings > Database
   - Find your connection string in this format:
     ```
     postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
     ```

3. Test database connection:
   ```bash
   psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres"
   ```

## Clerk.dev Integration

1. Create a Clerk.dev application:
   - Go to [Clerk Dashboard](https://dashboard.clerk.dev)
   - Create a new application
   - Select "API Only" for backend integration

2. Configure Clerk settings:
   - In Clerk dashboard, go to API Keys
   - Copy your Backend API Key (starts with `sk_test_` or `sk_live_`)
   - Note the JWT issuer URL (format: `https://[YOUR-DOMAIN].clerk.accounts.dev`)

3. Set up JWT verification:
   - Get your JWKS endpoint URL: `https://[YOUR-DOMAIN].clerk.accounts.dev/.well-known/jwks.json`
   - This is automatically handled by the backend's clerk_utils.py

## Environment Variables

Create a `.env` file in the root of your backend project with the following structure:

```ini
# Supabase Configuration
SUPABASE_URL=https://[YOUR-PROJECT-ID].supabase.co
SUPABASE_KEY=[YOUR-SUPABASE-ANON-KEY]
SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres

# Clerk.dev Configuration
CLERK_PUBLISHABLE_KEY=pk_test_[YOUR-PUBLISHABLE-KEY]
CLERK_SECRET_KEY=sk_test_[YOUR-SECRET-KEY]
CLERK_ISSUER=https://[YOUR-DOMAIN].clerk.accounts.dev

# Application Configuration
CORS_ORIGINS=http://localhost:3000,https://your-production-domain.com
ENVIRONMENT=development
LOG_LEVEL=debug
```

Important security notes:
- Never commit `.env` files to version control
- Use different keys for development and production
- Rotate keys periodically
- Restrict CORS origins in production

## Database Initialization

The database tables are automatically created when the application starts, thanks to SQLAlchemy's `create_all()` method in `main.py`. However, you can manually initialize the database:

1. Verify database connection:
   ```python
   from src.database import engine
   from src.models import Base

   # Create all tables
   Base.metadata.create_all(bind=engine)
   ```

2. Check table creation:
   ```sql
   -- Using psql or Supabase dashboard
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```

## Running the Backend

1. Development mode:
   ```bash
   uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
   ```

2. Production mode:
   ```bash
   uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --workers 4
   ```

The API will be available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- Health check: http://localhost:8000/

## Integration Testing

Test your setup with these curl commands:

1. Health check:
   ```bash
   curl http://localhost:8000/
   ```

2. Protected endpoint (requires Clerk token):
   ```bash
   # Replace [TOKEN] with a valid Clerk JWT
   curl -H "Authorization: Bearer [TOKEN]" \
        http://localhost:8000/protected/me
   ```

3. Book listing (public endpoint):
   ```bash
   curl http://localhost:8000/books?page=1&limit=10
   ```

## Development Best Practices

1. **Environment Management**:
   - Use separate .env files for different environments
   - Never commit sensitive credentials
   - Use environment-specific Clerk.dev and Supabase projects

2. **Security**:
   - Always validate JWT tokens
   - Use prepared statements (handled by SQLAlchemy)
   - Implement proper error handling
   - Sanitize user inputs

3. **Database**:
   - Use migrations for schema changes
   - Implement proper indexing
   - Use connection pooling
   - Handle database transactions properly

4. **Testing**:
   - Write unit tests for models and endpoints
   - Use test database instances
   - Mock external services in tests

5. **Monitoring**:
   - Implement proper logging
   - Monitor API performance
   - Track database query performance

## Phase Validation

### Phase 1 Checklist
- [ ] Database connection successful
- [ ] Tables created successfully
- [ ] Basic CRUD operations working
- [ ] Environment variables loaded correctly

### Phase 2 Checklist
- [ ] Clerk.dev JWT verification working
- [ ] Protected endpoints returning 401 for invalid tokens
- [ ] User authentication flow complete
- [ ] Session management working

### Phase 3 Checklist
- [ ] All core API endpoints implemented
- [ ] Pagination working correctly
- [ ] Error handling implemented
- [ ] API documentation up-to-date

## Troubleshooting

Common issues and solutions:

1. **Database Connection Errors**:
   - Verify connection string format
   - Check network/firewall settings
   - Confirm database credentials
   - Verify Supabase project status

2. **JWT Verification Failures**:
   - Confirm Clerk.dev configuration
   - Check token expiration
   - Verify JWKS endpoint accessibility
   - Validate token format

3. **CORS Issues**:
   - Check CORS_ORIGINS configuration
   - Verify frontend origin matches configuration
   - Ensure proper headers in requests

4. **Module Import Errors**:
   - Verify virtual environment activation
   - Check requirements.txt installation
   - Confirm Python version compatibility
   - Check file structure and imports

## Support and Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Clerk.dev Documentation](https://clerk.dev/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)

For additional support:
- Check the project's issue tracker
- Consult the team's internal documentation
- Contact the development team

Remember to keep this documentation updated as the project evolves and new features are added.
