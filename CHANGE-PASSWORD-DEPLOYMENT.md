# Change Password Feature - Deployment Guide

## 🔐 **New Feature Added: Secure Password Management**

I've implemented a complete **Change Password** feature that allows admins to securely update their login credentials directly from the admin panel.

## 📁 **Files to Upload/Update**

### **New Files (Upload these):**
```
public_html/
├── config/
│   └── admin_config.json          ← Admin credentials config file
└── api/
    └── admin_config.php           ← Password change API endpoint
```

### **Updated Files (Re-upload these):**
```
public_html/
├── admin-panel-php.html           ← Added "Change Password" button + modal
├── admin-login-php.html           ← Now authenticates via server API
├── api/
│   └── trials.php                 ← Now reads credentials from config file
└── js/
    └── admin-php.js               ← Added password change functionality
```

## 🚀 **Deployment Steps**

### **Step 1: Upload New Config System**
1. **Create `config` directory** in `public_html/`
2. **Upload [`config/admin_config.json`](config/admin_config.json)** 
3. **Upload [`api/admin_config.php`](api/admin_config.php)**
4. **Set permissions**: 
   - `config/` folder: **755**
   - `admin_config.json`: **666** (PHP needs write access)
   - `admin_config.php`: **644**

### **Step 2: Update Existing Files**
1. **Re-upload [`admin-panel-php.html`](admin-panel-php.html)** (has Change Password button)
2. **Re-upload [`admin-login-php.html`](admin-login-php.html)** (now uses server authentication)  
3. **Re-upload [`api/trials.php`](api/trials.php)** (reads from config file)
4. **Re-upload [`js/admin-php.js`](js/admin-php.js)** (password change functionality)

### **Step 3: Verify Permissions**
```
config/                    → 755
config/admin_config.json   → 666
api/admin_config.php       → 644
api/trials.php            → 644
```

## ✅ **How It Works**

### **1. Secure Authentication Flow**
- Login now authenticates against **server-side config** (not hardcoded JavaScript)
- Credentials stored in separate [`config/admin_config.json`](config/admin_config.json) file
- PHP validates credentials and manages sessions

### **2. Change Password Interface**
- **"🔐 Change Password"** button in admin panel
- Secure modal with form validation
- Requires current password to change credentials

### **3. Password Security Features**
- **Minimum 8 characters**
- **Uppercase + lowercase letters required**
- **Numbers required**
- **Special characters required**
- **Password confirmation matching**
- **Current password verification**

### **4. Automatic Updates**
- Changes are **immediately effective**
- Updates both **username and password**
- **Session automatically updated**
- **No need to re-login after change**

## 🎯 **Testing the Feature**

### **Step 1: Test Login**
1. Visit: `https://yourdomain.com/admin-login-php.html`
2. Login with: `admin` / `clinicaltrials2024`
3. Should successfully authenticate via server

### **Step 2: Test Password Change**
1. In admin panel, click **"🔐 Change Password"**
2. Fill in the form:
   - **Current Password**: `clinicaltrials2024`
   - **New Username**: `youradmin` (or keep `admin`)
   - **New Password**: `YourSecure123!`
   - **Confirm Password**: `YourSecure123!`
3. Click **"Update Password"**
4. Should show success message

### **Step 3: Verify New Credentials**
1. **Logout** from admin panel
2. **Try old credentials** → Should fail
3. **Try new credentials** → Should work ✅

## 🛡️ **Security Benefits**

### **Before (Hardcoded Credentials):**
- ❌ Credentials in JavaScript files (visible to users)
- ❌ Required manual file editing to change
- ❌ Same credentials for all deployments
- ❌ No password strength requirements

### **After (Secure Config System):**
- ✅ Credentials stored server-side only
- ✅ Easy password changes via admin panel
- ✅ Strong password requirements enforced
- ✅ Automatic backups of config changes
- ✅ Server-side validation and authentication

## 🔧 **Advanced Configuration**

### **Custom Password Rules**
Edit [`config/admin_config.json`](config/admin_config.json):
```json
{
  "admin_credentials": {
    "username": "admin",
    "password": "clinicaltrials2024"
  },
  "security": {
    "password_min_length": 12,        ← Change minimum length
    "require_special_chars": true     ← Require special characters
  }
}
```

### **Backup and Recovery**
- **Automatic backups** created on each password change
- **Location**: `config/admin_config.json.backup.YYYY-MM-DD-HH-MM-SS`
- **Recovery**: Rename backup file to `admin_config.json`

## 📋 **Complete File Structure**

```
public_html/
├── index-php.html
├── admin-login-php.html          ← ✅ Updated (server auth)
├── admin-panel-php.html          ← ✅ Updated (change password)
├── trial-detail-php.html  
├── config/
│   └── admin_config.json         ← ✅ New (credentials storage)
├── api/
│   ├── trials.php                ← ✅ Updated (reads config)  
│   └── admin_config.php          ← ✅ New (password API)
├── js/
│   ├── admin-php.js              ← ✅ Updated (password feature)
│   ├── trial-manager-php.js
│   ├── main-php.js
│   ├── search-filter.js
│   └── utils.js
├── css/ [all CSS files]
└── data/trials.json
```

## 🎉 **Benefits for You**

1. **🔒 Much More Secure** - No more hardcoded passwords
2. **👤 User-Friendly** - Change password without file editing  
3. **🔄 Immediate Changes** - New credentials work instantly
4. **💪 Strong Passwords** - Enforced security requirements
5. **📚 Automatic Backups** - Never lose access to your system

Upload the files and you'll have a professional, secure password management system! 🚀