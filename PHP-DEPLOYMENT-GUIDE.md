# PHP Deployment Guide - Clinical Trials Website

This guide shows how to deploy the **PHP version** of your clinical trials website with **true server-side data persistence** on Namecheap shared hosting.

## 🔄 **Version Differences**

### **Static Version (Original)**
- ❌ Admin changes only saved in browser localStorage
- ❌ Changes not visible to other users
- ❌ Data lost when browser cache is cleared
- ✅ Simple file upload deployment

### **PHP Version (New)**
- ✅ Admin changes saved permanently to server
- ✅ Changes visible to all users immediately
- ✅ Data persists across all browsers and devices
- ✅ Automatic backups created on data changes
- ✅ Server-side authentication and validation
- ✅ Private physician forum with SQLite-backed accounts and moderation

## 📁 **File Structure for PHP Version**

```
public_html/
├── index-php.html              # Main page (PHP version)
├── about-php.html              # About page (PHP version)
├── physician-community-php.html # Physician community forum page
├── physician-login-php.html    # Physician sign-in page
├── trial-detail-php.html       # Trial details (PHP version)
├── admin-login-php.html        # Admin login (PHP version)
├── admin-panel-php.html        # Admin panel (PHP version)
├── api/
│   ├── bootstrap.php           # Shared SQLite/session/bootstrap helpers
│   ├── auth.php                # Admin + physician auth/session API
│   ├── physicians.php          # Physician management API
│   ├── community.php           # Forum threads/replies API
│   └── trials.php              # Trial catalog API
├── css/
│   ├── styles.css              # Main styles
│   ├── components.css          # Component styles
│   └── admin.css               # Admin styles
├── js/
│   ├── utils.js                # Utility functions
│   ├── trial-manager-php.js    # PHP-enabled data manager
│   ├── community-prototype-php.js # Physician community forum logic
│   ├── admin-login-php.js      # Admin login logic
│   ├── physician-login-php.js  # Physician login logic
│   ├── search-filter.js        # Search & filter logic
│   ├── main-php.js             # PHP main application
│   └── admin-php.js            # PHP-enabled admin panel
└── data/
    └── trials.json             # Clinical trials database (PHP modifiable)
```

## 🚀 **Deployment Steps**

### **Step 1: Access Your Namecheap cPanel**
1. Log into your Namecheap account
2. Go to "Domain List" → "Manage" next to your domain
3. Click "cPanel" or "Advanced" → "cPanel"
4. Or visit: `https://yourdomain.com:2083`

### **Step 2: Verify PHP Support**
1. In cPanel, look for **"PHP Selector"** or **"Select PHP Version"**
2. Ensure PHP 7.4+ is selected (8.0+ recommended)
3. Enable these PHP extensions if not already enabled:
   - `json`
   - `fileinfo`
   - `filter`
   - `pdo_sqlite`
   - `sqlite3`

### **Step 3: Upload PHP Version Files**
1. **Open File Manager** in cPanel
2. **Navigate to `public_html`**
3. **Upload these files**:

   **Main Files:**
   - `index-php.html` → upload to public_html root
   - `about-php.html` → upload to public_html root
   - `physician-community-php.html` → upload to public_html root
   - `physician-login-php.html` → upload to public_html root
   - `admin-panel-php.html` → upload to public_html root
   - `admin-login-php.html` → upload to public_html root (IMPORTANT: Use PHP version!)
   - `trial-detail-php.html` → upload to public_html root (IMPORTANT: Use PHP version!)

   **API Directory:**
   - Create folder: `api`
   - Upload `bootstrap.php` to `public_html/api/`
   - Upload `auth.php` to `public_html/api/`
   - Upload `physicians.php` to `public_html/api/`
   - Upload `community.php` to `public_html/api/`
   - Upload `trials.php` to `public_html/api/`

   **JavaScript Files:**
   - Create folder: `js`
   - Upload `trial-manager-php.js` to `public_html/js/`
   - Upload `admin-php.js` to `public_html/js/`
   - Upload `community-prototype-php.js` to `public_html/js/`
   - Upload `admin-login-php.js` to `public_html/js/`
   - Upload `physician-login-php.js` to `public_html/js/`
   - Upload `utils.js`, `search-filter.js`, `main-php.js` to `public_html/js/`

   **CSS Files:**
   - Create folder: `css`
   - Upload `styles.css`, `components.css`, `admin.css` to `public_html/css/`

   **Data Directory:**
   - Create folder: `data`
   - Upload `trials.json` to `public_html/data/`

### **Step 4: Set File Permissions**
1. **PHP file permissions**: Set `trials.php` to **644**
2. **JSON file permissions**: Set `trials.json` to **666** (read/write for PHP)
3. **Data directory permissions**: Set `data` folder to **755**
4. **SQLite directory permissions**: Ensure the configured SQLite directory is writable by PHP
5. **All other files**: Set to **644**
6. **All directories**: Set to **755**

### **Step 5: Configure Your Website**
Create a `.htaccess` file in `public_html` root:

```apache
# Redirect main domain to PHP version
DirectoryIndex index-php.html

# Enable PHP error reporting (remove in production)
php_flag display_errors on
php_value error_reporting E_ALL

# Security headers
Header always set X-Frame-Options DENY
Header always set X-Content-Type-Options nosniff

# Protect sensitive files
<Files "*.json">
    # Allow API access but deny direct browser access
    <RequireAll>
        Require all denied
    </RequireAll>
</Files>

<Files "trials.json">
    # Allow API access to trials.json
    <RequireAll>
        Require all granted
    </RequireAll>
</Files>

<FilesMatch "\.(sqlite|db|backup|bak)$">
    Require all denied
</FilesMatch>

# Pretty URLs (optional)
RewriteEngine On
RewriteRule ^admin$ admin-panel-php.html [L]
RewriteRule ^login$ admin-login-php.html [L]
```

## 🔧 **Testing Your Deployment**

### **Step 1: Test Public Access**
1. Visit: `https://yourdomain.com`
2. Should load with all 30 clinical trials
3. Test search and filtering
4. Click trial cards to view details

### **Step 2: Test API Endpoints**
Visit: `https://yourdomain.com/api/trials.php`
- Should return JSON with all trials
- If you see PHP code instead, PHP isn't working

### **Step 3: Test Admin Functionality**
1. Visit: `https://yourdomain.com/admin-login-php.html` ← **IMPORTANT: Use PHP version!**
2. Login with:
   - **Username**: `admin`
   - **Password**: `clinicaltrials2024`
3. Should redirect to `admin-panel-php.html` (not 404!)
4. **Test adding a trial** - this will save to server!
5. **Log out and log back in** - your trial should still be there
6. **Open in another browser** - your trial should be visible

### **Step 4: Test Physician Forum Functionality**
1. In the admin dashboard, create a physician account with a temporary password
2. Visit: `https://yourdomain.com/physician-login-php.html`
3. Sign in with the assigned physician username and temporary password
4. Confirm the physician must change password before viewing forum content
5. After password change, create a thread and reply in the physician forum
6. Confirm the admin dashboard can lock the thread or deactivate the physician account

## ⚙️ **Advanced Configuration**

### **Custom Admin Credentials**
- The first secure boot migrates the legacy admin credential into SQLite and removes the plain-text password from `config/admin_config.json`
- After deployment, change the admin password from the admin dashboard instead of editing PHP files

### **Database Backups**
The system automatically creates backups when data changes:
- Location: `data/trials.json.backup.YYYY-MM-DD-HH-MM-SS`
- Accessible via cPanel File Manager
- Restore by renaming backup file to `trials.json`

### **Error Logging**
Check PHP errors in cPanel:
1. Go to **"Error Logs"** in cPanel
2. Look for PHP errors related to your domain
3. Common issues: file permissions, PHP version

### **Security Enhancements**
1. **Change default credentials** immediately
2. **Use strong passwords**
3. **Regular backups** of the `data` directory
4. **Monitor access logs** in cPanel

## 🔒 **Security Features**

### **Built-in Security**
- ✅ SQL injection prevention (no SQL used)
- ✅ XSS protection with input sanitization
- ✅ CSRF protection through credential validation
- ✅ File access controls via .htaccess
- ✅ Automatic data backups
- ✅ Server-side validation for all inputs

### **Data Protection**
- Admin and physician credentials stored as password hashes in SQLite
- All trial data validated before saving
- Automatic backups prevent data loss
- JSON and SQLite files protected from direct access

## 📊 **Admin Features (PHP Version)**

### **What Admins Can Do:**
✅ **Add new trials** - saved permanently to server  
✅ **Edit existing trials** - changes visible immediately  
✅ **Delete trials** - permanently removed from server  
✅ **Export data** - download current database  
✅ **Search and filter** - in admin panel  
✅ **View statistics** - real-time trial counts  
✅ **Create physician accounts** - assign usernames and temporary passwords  
✅ **Reset/deactivate physician access** - enforce first-login password change  
✅ **Moderate the forum** - lock threads and soft-delete threads or replies  

### **Persistence Benefits:**
- Changes visible to all website visitors instantly
- Data survives server restarts and browser changes
- Multiple admins can collaborate (with same credentials)
- Automatic backups protect against data loss

## 🌐 **Your Live URLs**

After deployment:
- **Main Website**: `https://yourdomain.com`
- **About Page**: `https://yourdomain.com/about-php.html`
- **Physician Community Forum**: `https://yourdomain.com/physician-community-php.html`
- **Physician Sign In**: `https://yourdomain.com/physician-login-php.html`
- **Admin Login**: `https://yourdomain.com/admin-login-php.html`
- **Admin Panel**: `https://yourdomain.com/admin-panel-php.html`
- **Auth API**: `https://yourdomain.com/api/auth.php?action=session`
- **Trials API**: `https://yourdomain.com/api/trials.php`

## 🆘 **Troubleshooting**

### **Website doesn't load:**
- Check file permissions (644 for files, 755 for directories)
- Verify PHP is enabled in cPanel
- Check error logs in cPanel

### **Admin changes don't save:**
- Check `data` directory permissions (755)
- Check `trials.json` permissions (666)
- Verify PHP has write access to the `data` directory
- Check PHP error logs

### **API returns errors:**
- Verify PHP version 7.4+
- Check that JSON extension is enabled
- Test API directly: `yourdomain.com/api/trials.php`

### **Blank page or PHP code visible:**
- PHP is not properly configured
- Check PHP version in cPanel
- Contact Namecheap support for PHP configuration

## 🎯 **Success Indicators**

Your PHP version is working correctly if:
1. ✅ Main page loads with trial cards
2. ✅ Admin login works with credentials
3. ✅ Adding a trial saves it permanently
4. ✅ Changes are visible in new browser windows
5. ✅ API endpoint returns JSON data
6. ✅ No PHP errors in logs

## 📞 **Support Resources**

- **Namecheap PHP Docs**: [Namecheap PHP Support](https://www.namecheap.com/support/knowledgebase/article.aspx/320/61/php-scripts-configuration)
- **cPanel File Manager**: Use for file permissions and backups
- **Error Logs**: Check for PHP errors and issues

---

**Congratulations!** You now have a fully functional clinical trials website with **real admin persistence** that saves all changes permanently to your server. Admin changes are immediately visible to all visitors, and your data is automatically backed up with each change.
