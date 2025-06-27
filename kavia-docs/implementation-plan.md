# BookSwap+ Project – Comprehensive Implementation Plan

## Observations

BookSwap+ is envisioned as a modern platform to enable public book listings, intelligent matching, and book exchange. It distinguishes itself by leveraging OpenRouter's LLMs (like Mistral) for semantic, human-like recommendations.  
Key architectural notes:

- **Authentication**: Entrusted to Clerk.dev with server-side JWT validation.
- **Database**: Cloud-hosted PostgreSQL via Supabase (preferred) or NeonDB.
- **Container Layout**:
  - **Backend (`bookswap_backend`)** – FastAPI: Handles all REST endpoints, LLM semantic matching, DB operations, Clerk.dev hooks.
  - **Frontend (`bookswap_frontend`)** – React: User interface, REST client for backend APIs.
- **Current State**:
  - Backend: Only a minimal FastAPI setup; no DB, auth, domain models, or endpoints implemented.
  - Frontend: Vanilla React starter with theme toggle; lacks domain UI or logic.
- **Unimplemented**: Domain logic, authentication, Clerk.dev integration, LLM communication, full REST API, database models, and UI/flows.

---

## Environment Configuration

### Backend (.env)
```
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
SUPABASE_URL=https://...
SUPABASE_KEY=eyJ...
SUPABASE_DB_URL=postgresql://...
OPENROUTER_API_KEY=sk-or-...
CORS_ORIGINS=http://localhost:3000,https://your-prod-domain.com
```

### Frontend (.env)
```
REACT_APP_CLERK_PUBLISHABLE_KEY=pk_test_...
REACT_APP_API_BASE_URL=http://localhost:8000
```

---

## Backend Phases

### **Phase 1 – Database Schema and Basic Models**

- **Goal**: Establish the foundation for persistent data storage.
- **Action**: Create ORM models using SQLAlchemy with LLM caching support:
  ```python
  # Example Book model with LLM caching fields
  class Book(Base):
      id = Column(UUID, primary_key=True)
      title = Column(String)
      description = Column(Text)
      semantic_tags = Column(ARRAY(String))  # LLM-generated tags
      llm_summary = Column(Text)  # Cached summary
      match_vector = Column(ARRAY(Float))  # Embedding for matching
      last_llm_update = Column(DateTime)  # For cache invalidation
  ```
- **Setup**: Configure DB connection via the Supabase Postgres URI.
- **Files**: In `src/` as `models.py`, `database.py`.

### **Phase 2 – Clerk.dev Authentication Integration**

- **Goal**: Secure endpoints with proper JWT validation.
- **Action**: 
  1. Create `src/auth/clerk_utils.py` for JWT handling:
     ```python
     from typing import Optional
     import httpx
     from fastapi import HTTPException
     from jose import jwt
     from cachetools import TTLCache

     class ClerkAuth:
         def __init__(self):
             self._jwks_cache = TTLCache(maxsize=1, ttl=3600)  # 1-hour cache
         
         async def get_jwks(self) -> dict:
             if 'jwks' not in self._jwks_cache:
                 async with httpx.AsyncClient() as client:
                     response = await client.get(
                         'https://clerk.your-domain.com/.well-known/jwks.json'
                     )
                     self._jwks_cache['jwks'] = response.json()
             return self._jwks_cache['jwks']
         
         async def verify_token(self, token: str) -> Optional[dict]:
             try:
                 jwks = await self.get_jwks()
                 # Verify and decode JWT using cached public keys
                 claims = jwt.decode(
                     token,
                     key=jwks,
                     algorithms=['RS256'],
                     audience='your-audience'
                 )
                 return claims
             except Exception as e:
                 raise HTTPException(status_code=401, detail=str(e))
     ```
  2. Add FastAPI dependency for protected routes:
     ```python
     from fastapi import Depends, Header
     from typing import Annotated

     async def get_current_user(
         authorization: Annotated[str, Header()]
     ) -> dict:
         token = authorization.replace('Bearer ', '')
         return await clerk_auth.verify_token(token)
     ```
- **Files**: `src/auth/clerk_utils.py`, `src/api/dependencies.py`

### **Phase 3 – Core API Endpoints**

- **Goal**: Provide a complete RESTful API with pagination.
- **Action**:
  1. Create pagination models:
     ```python
     from pydantic import BaseModel
     from typing import Generic, TypeVar, List

     T = TypeVar('T')

     class Page(BaseModel, Generic[T]):
         items: List[T]
         total: int
         page: int
         size: int
         pages: int
     ```
  2. Implement paginated endpoints:
     ```python
     @router.get("/books/", response_model=Page[Book])
     async def list_books(
         page: int = 1,
         limit: int = 20,
         genre: str = None,
         current_user: dict = Depends(get_current_user)
     ):
         query = select(Book)
         if genre:
             query = query.where(Book.genre == genre)
             
         total = await db.scalar(select(func.count()).select_from(query))
         
         items = await db.scalars(
             query.offset((page - 1) * limit).limit(limit)
         )
         
         return Page(
             items=items,
             total=total,
             page=page,
             size=limit,
             pages=ceil(total / limit)
         )
     ```
- **Files**: Modular API routers under `src/api/`

### **Phase 4 – OpenRouter LLM Semantic Match Engine**

- **Goal**: Integrate LLM-powered semantic matching with caching.
- **Action**: 
  1. Implement LLM client with caching logic:
     ```python
     from datetime import datetime, timedelta
     
     class SemanticEngine:
         async def get_or_generate_tags(self, book: Book) -> List[str]:
             if (
                 book.semantic_tags and 
                 book.last_llm_update > datetime.now() - timedelta(days=30)
             ):
                 return book.semantic_tags
                 
             tags = await self._generate_tags_from_llm(book.description)
             book.semantic_tags = tags
             book.last_llm_update = datetime.now()
             await db.commit()
             return tags
     ```
  2. Add cache invalidation triggers on content updates
- **Files**: `src/services/semantic.py`

### **Phase 5 – Recommendation and Matchmaking Endpoint**

- **Goal**: Deliver recommendations for books/users to swap with.
- **Action**: Create endpoints using cached LLM metadata.
- **Files**: New API routers with pagination support.

---

## Frontend Phases

### **Phase 1 – Project Setup and API Integration Layer**

- **Goal**: Establish communication with backend API.
- **Action**: 
  1. Create authenticated API client:
     ```javascript
     // src/api/client.js
     import axios from 'axios';

     const api = axios.create({
       baseURL: process.env.REACT_APP_API_BASE_URL,
     });

     api.interceptors.request.use(async (config) => {
       const token = await window.Clerk.session.getToken();
       config.headers.Authorization = `Bearer ${token}`;
       return config;
     });

     export const fetchBooks = async ({ page = 1, limit = 20, genre }) => {
       const params = new URLSearchParams({ page, limit });
       if (genre) params.append('genre', genre);
       
       const response = await api.get(`/books/?${params}`);
       return response.data;
     };
     ```
- **Files**: `src/api/client.js`, environment setup

### **Phase 2 – Clerk.dev Authentication UI**

- **Goal**: Authentication flows with proper session management.
- **Action**: 
  1. Create authentication context and hook:
     ```javascript
     // src/auth/AuthContext.js
     import { createContext, useContext, useEffect, useState } from 'react';
     import { useClerk, useUser } from '@clerk/clerk-react';

     const AuthContext = createContext(null);

     export const AuthProvider = ({ children }) => {
       const { session } = useClerk();
       const { user, isLoaded } = useUser();
       const [token, setToken] = useState(null);

       useEffect(() => {
         const updateToken = async () => {
           if (session) {
             const token = await session.getToken();
             setToken(token);
           }
         };
         updateToken();
       }, [session]);

       return (
         <AuthContext.Provider value={{ user, isLoaded, token }}>
           {children}
         </AuthContext.Provider>
       );
     };

     export const useAuth = () => {
       const context = useContext(AuthContext);
       if (!context) {
         throw new Error('useAuth must be used within AuthProvider');
       }
       return context;
     };
     ```
  2. Protect routes and manage auth state
- **Files**: `src/auth/` directory

### **Phase 3 – Core Pages, Flows, and Components**

- **Goal**: Core user functionality.
- **Action**: UI for:
  - Book listing grid & CRUD (with pagination controls)
  - Swap/exchange requests
  - Recommendation dashboard
  - User profile management
  - Navigation for accessibility
- **Files**: Main `src/` directory

### **Phase 4 – Match Recommendations UI**

- **Goal**: Display dynamic, personalized content.
- **Action**: Components/pages for LLM-powered matches and swap management.
- **Files**: Corresponding UI modules.

### **Phase 5 – UX Polish and Error Handling**

- **Goal**: Robust and user-friendly experience.
- **Action**: Add loading states, error boundaries, validation, and responsive fixes.
- **Files**: Throughout `src/`

---

## Developer Experience, Documentation, and Quality

- **Goal**: Enhance onboarding, reliability, and maintainability.
- **Action**: Update documentation (README, usage, development guide); recommend OpenAPI generation/verification.

---

## Dependency Order and Inter-Container Considerations

- Backend JWT validation and database models must precede frontend development.
- API contract stability (including pagination) is crucial for frontend/backend collaboration.
- Authentication (Clerk.dev) and DB (Supabase) require environment variable coordination.
- LLM integration can be mocked initially, with caching implementation following core features.

---

## Issues and Risks

- Entire domain logic, API, and UI flows need implementation; substantial effort required.
- Three external APIs (Supabase, Clerk.dev, OpenRouter) introduce potential points of failure.
- LLM caching requires careful invalidation strategy to balance freshness and performance.
- Clerk JWT validation must be robust with proper key rotation and error handling.

---

## Summary Flow Diagram

Below is a high-level architecture and process flow for BookSwap+:

```mermaid
flowchart TD
  subgraph Backend[BookSwap+ Backend (FastAPI)]
    direction TB
    B1[User ORM\n(SQLAlchemy)]
    B2[Book ORM\nw/LLM Cache]
    B3[SwapOffer ORM]
    B5[Clerk JWT\nValidator]
    B6[Semantic Match Engine\n(OpenRouter + Cache)]
    B7[API Routers:\n- Profile\n- Books\n- Swaps\n+ Pagination]
    DB[(Supabase\nPostgreSQL)]
    B1-->|CRUD|DB
    B2-->|CRUD|DB
    B3-->|CRUD|DB
    B5-->|Verify|B7
    B7-->|REST|Frontend
    B6-->|Recommendations|B7
  end

  subgraph Frontend[BookSwap+ Frontend (React)]
    direction TB
    F1[Clerk.dev\nAuth Provider]
    F2[API Client\n(With JWT)]
    F3[Book Listings UI\n+ Pagination]
    F4[Swap Offers UI]
    F5[Recommendations\nDashboard]
    F1-->|Session + Token|F2
    F2-->|Fetch/Mutate|Backend
    F2-->|Book Data|F3
    F2-->|Swap Data|F4
    F2-->|Recommendations|F5
  end

  classDef backend fill:#E8EAF6,stroke:#634C90;
  classDef frontend fill:#FFF3E0,stroke:#E87A41;
  class Backend,DB backend;
  class Frontend frontend;
```

---

## Conclusion

This implementation plan outlines the phased delivery of BookSwap+, with particular attention to security (JWT validation), performance (LLM caching), and user experience (pagination). It provides a structured approach to building a secure and scalable platform while managing the complexity of external service integration. The removal of the notification system simplifies the initial implementation, allowing focus on core book exchange functionality.
