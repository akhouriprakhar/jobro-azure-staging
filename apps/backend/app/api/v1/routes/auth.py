from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.core.auth import TokenData, create_access_token, verify_access_token
from app.core.config import settings
from app.schemas.auth import TokenResponse

router = APIRouter()


@router.post("/token", response_model=TokenResponse)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    # Placeholder user validation. Replace with a real user store.
    if form_data.username != "admin" or form_data.password != "ChangeMe123!":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": form_data.username}, expires_delta=access_token_expires
    )
    return TokenResponse(access_token=access_token, token_type="bearer")


@router.get("/me")
async def read_current_user(token_data: dict = Depends(verify_access_token)):
    return {"username": token_data["username"]}


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str):
    from supabase import create_client
    from app.core.config import settings
    
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    
    try:
        # 1. Ban the user in Supabase Auth (revoke access)
        try:
            client.auth.admin.update_user_by_id(user_id, ban_duration="87600h")
        except Exception as e:
            print(f"Warning: Failed to ban auth user {user_id} directly (using anon key instead of service_role key): {e}")
            
        # 2. Get current profile name and append [DELETED] prefix
        prof_res = client.table("profiles").select("full_name").eq("id", user_id).execute()
        if prof_res.data:
            current_name = prof_res.data[0].get("full_name") or ""
            if not current_name.startswith("[DELETED]"):
                new_name = f"[DELETED] {current_name}".strip()
                client.table("profiles").update({"full_name": new_name}).eq("id", user_id).execute()
                
        return {"status": "success"}
    except Exception as e:
        print(f"Error soft-deleting user {user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to soft-delete user: {str(e)}"
        )


@router.get("/users", response_model=list[dict])
async def get_users():
    from supabase import create_client
    from app.core.config import settings
    from datetime import datetime, timezone
    
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    
    # 1. Fetch profiles
    profiles_data = []
    try:
        res = client.table("profiles").select("*").execute()
        profiles_data = res.data or []
    except Exception as e:
        print(f"Error fetching profiles: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch profiles")
        
    # 2. Fetch user roles mapping
    roles_map = {}
    try:
        res_roles = client.table("user_roles").select("user_id, roles(name)").execute()
        if res_roles.data:
            for item in res_roles.data:
                u_id = item.get("user_id")
                r_name = item.get("roles", {}).get("name") if item.get("roles") else None
                if u_id and r_name:
                    roles_map[str(u_id)] = r_name
    except Exception as e:
        print(f"Warning: Failed to fetch user roles mapping: {e}")
        
    # 3. Fetch auth users from admin API to check banned status
    auth_users_map = {}
    try:
        res_users = client.auth.admin.list_users()
        users_list = getattr(res_users, "users", res_users) if res_users else []
        for u in users_list:
            u_id = str(u.id)
            banned_until = getattr(u, "banned_until", None)
            
            # Check if banned_until is in the future
            is_banned = False
            if banned_until:
                try:
                    cleaned = banned_until.replace("Z", "+00:00")
                    ban_date = datetime.fromisoformat(cleaned)
                    now = datetime.now(timezone.utc)
                    if ban_date > now:
                        is_banned = True
                except Exception as ex:
                    print(f"Warning: Failed to parse banned_until {banned_until}: {ex}")
            auth_users_map[u_id] = is_banned
    except Exception as e:
        print(f"Warning: Failed to fetch auth users list from admin API: {e}")
        
    # 4. Merge all together
    merged_users = []
    for p in profiles_data:
        p_id = str(p["id"])
        full_name = p.get("full_name") or ""
        
        # Skip soft-deleted users
        if full_name.startswith("[DELETED]"):
            continue
            
        role = roles_map.get(p_id, "Student")
        disabled = auth_users_map.get(p_id, False) or full_name.startswith("[DISABLED]")
        
        merged_users.append({
            "id": p_id,
            "email": p.get("email") or "",
            "full_name": full_name,
            "created_at": p.get("created_at") or "",
            "role": role,
            "disabled": disabled
        })
        
    return merged_users


@router.post("/users/{user_id}/status")
async def toggle_user_status(user_id: str, payload: dict):
    from supabase import create_client
    from app.core.config import settings
    
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    disabled = payload.get("disabled", False)
    
    try:
        # 1. Update ban_duration in Supabase Auth (Optional fallback)
        try:
            if disabled:
                client.auth.admin.update_user_by_id(user_id, ban_duration="87600h")
            else:
                client.auth.admin.update_user_by_id(user_id, ban_duration="none")
        except Exception as e:
            print(f"Warning: Failed to toggle auth ban for user {user_id}: {e}")
            
        # 2. Update the profile name to start with [DISABLED] or remove it
        prof_res = client.table("profiles").select("full_name").eq("id", user_id).execute()
        if prof_res.data:
            current_name = prof_res.data[0].get("full_name") or ""
            if disabled:
                if not current_name.startswith("[DISABLED]"):
                    new_name = f"[DISABLED] {current_name}".strip()
                    client.table("profiles").update({"full_name": new_name}).eq("id", user_id).execute()
            else:
                if current_name.startswith("[DISABLED]"):
                    new_name = current_name.replace("[DISABLED]", "").strip()
                    client.table("profiles").update({"full_name": new_name}).eq("id", user_id).execute()
                    
        return {"status": "success", "disabled": disabled}
    except Exception as e:
        print(f"Error toggling status for user {user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update user status: {str(e)}"
        )


@router.post("/users/{user_id}/name")
async def update_user_name(user_id: str, payload: dict):
    from supabase import create_client
    from app.core.config import settings
    
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    full_name = payload.get("full_name")
    if not full_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
        
    try:
        # Update name in profiles
        res = client.table("profiles").update({"full_name": full_name}).eq("id", user_id).execute()
        return {"status": "success", "full_name": full_name}
    except Exception as e:
        print(f"Error updating name for user {user_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update user name: {str(e)}"
        )


@router.post("/users", status_code=200)
async def add_user(payload: dict):
    from supabase import create_client
    from app.core.config import settings
    from datetime import datetime
    
    client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    email = payload.get("email")
    full_name = payload.get("fullName")
    role_name = payload.get("role", "New Lead")
    
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
        
    try:
        # 1. Check if user already exists in profiles
        profile_res = client.table("profiles").select("*").eq("email", email).execute()
        existing_profile = profile_res.data[0] if profile_res.data else None
        
        # 2. Get role ID for target role
        role_res = client.table("roles").select("id").eq("name", role_name).execute()
        if not role_res.data:
            # Auto-create role if it doesn't exist
            role_res = client.table("roles").insert({"name": role_name}).execute()
        
        target_role_id = role_res.data[0]["id"] if role_res.data else None
        
        if existing_profile:
            user_id = existing_profile["id"]
            existing_name = existing_profile.get("full_name") or ""
            
            if existing_name.startswith("[DELETED]") or payload.get("force_restore", False):
                # Restore the user!
                # Unban in Supabase Auth
                try:
                    client.auth.admin.update_user_by_id(user_id, ban_duration="none")
                except Exception:
                    client.auth.admin.update_user_by_id(user_id, attributes={"ban_duration": "none"})
                    
                # Update profiles table name (remove prefix or use new name)
                clean_name = full_name if full_name else existing_name.replace("[DELETED]", "").strip()
                client.table("profiles").update({"full_name": clean_name}).eq("id", user_id).execute()
                
                # Update roles mapping
                client.table("user_roles").delete().eq("user_id", user_id).execute()
                if target_role_id:
                    client.table("user_roles").insert({"user_id": user_id, "role_id": target_role_id}).execute()
                    
                return {
                    "status": "restored",
                    "user": {
                        "id": user_id,
                        "email": email,
                        "full_name": clean_name,
                        "role": role_name,
                        "created_at": existing_profile.get("created_at") or ""
                    }
                }
            else:
                raise HTTPException(status_code=400, detail="User with this email already exists and is active")
                
        # 3. Create a new user in Supabase Auth
        password = "TemporaryPassword123!"
        user_id = None
        try:
            auth_res = client.auth.admin.create_user(email=email, password=password, email_confirm=True)
            user_id = str(auth_res.user.id) if hasattr(auth_res, "user") else str(auth_res.id)
        except Exception as e:
            try:
                auth_res = client.auth.admin.create_user(attributes={"email": email, "password": password, "email_confirm": True})
                user_id = str(auth_res.user.id) if hasattr(auth_res, "user") else str(auth_res.id)
            except Exception as inner_e:
                print(f"Error creating auth user: {inner_e}")
                # Fallback: check if the user is already in Supabase Auth (e.g. orphaned auth)
                users_res = client.auth.admin.list_users()
                users_list = getattr(users_res, "users", users_res) or []
                for u in users_list:
                    if getattr(u, "email", None) == email:
                        user_id = str(u.id)
                        break
                if not user_id:
                    raise HTTPException(status_code=500, detail=f"Failed to create auth credentials: {str(inner_e)}")
                    
        # 4. Upsert profile in database
        client.table("profiles").upsert({"id": user_id, "email": email, "full_name": full_name}).execute()
        
        # 5. Insert role mapping
        if target_role_id:
            client.table("user_roles").delete().eq("user_id", user_id).execute()
            client.table("user_roles").insert({"user_id": user_id, "role_id": target_role_id}).execute()
            
        return {
            "status": "created",
            "user": {
                "id": user_id,
                "email": email,
                "full_name": full_name,
                "role": role_name,
                "created_at": datetime.now().isoformat()
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error adding user: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add user: {str(e)}")
