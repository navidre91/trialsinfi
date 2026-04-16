# Clinical Trials SoCal Website

A modern, responsive web application for browsing and managing clinical trials in Southern California. Built with vanilla HTML, CSS, and JavaScript for easy deployment and maintenance.

## 🌟 Features

### Public Features
- **Browse Clinical Trials**: View all available clinical trials with filtering and search capabilities
- **Private Physician Community Forum**: Secure disease-group and trial-based physician discussions with:
  - Admin-assigned real-name physician accounts and first-login password change
  - Group switching (Prostate/Bladder/Kidney/Testicular) and trial-specific threads
  - Real thread/reply posting with single-level replies
  - Edit-your-own thread and reply permissions
  - De-identified discussion reminders and administrator moderation
- **Detailed Trial Information**: Click on any trial to view comprehensive details including:
  - Trial description and objectives
  - Qualification requirements and eligibility criteria
  - Location and contact information
  - Study timeline and phase information
- **Advanced Search & Filtering**: 
  - Search by title, description, condition, or location
  - Filter by status (ongoing, upcoming, past)
  - Filter by location and study type
  - Sort by various criteria
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices

### Admin Features
- **Secure Authentication**: Server-side admin sessions with hashed passwords, CSRF protection, and login throttling
- **Trial Management**: Add, edit, and delete clinical trials
- **Physician Account Management**: Create physician accounts, assign temporary passwords, reset passwords, and deactivate access
- **Forum Moderation**: Lock discussion threads and soft-delete threads or replies
- **Dashboard Analytics**: View statistics about trial counts and status distribution
- **Data Export**: Export trial data as JSON or CSV for backup/migration
- **CSV Upload**: Bulk import trials from CSV with partial-import error reporting
- **Draft-Safe Entry Modal**: Trial form autosaves draft data locally and restores it

## 🚀 Quick Start

### Prerequisites
- Modern web browser (Chrome, Firefox, Safari, Edge)
- No server setup required - runs directly from files
- Optional: Simple HTTP server for optimal performance

### Installation

1. **Download/Clone the project**
   ```bash
   # If using git
   git clone [repository-url]
   
   # Or download and extract the ZIP file
   ```

2. **Open the website**
   
   **Option A: Direct File Access**
   - Open `index.html` in your web browser
   - Navigate through the site normally
   
   **Option B: Local HTTP Server (Recommended)**
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Using Node.js (if you have http-server installed)
   npx http-server
   
   # Using PHP
   php -S localhost:8000
   ```
   Then visit `http://localhost:8000`

3. **Start browsing trials**
   - The main page will load with 30 sample clinical trials
   - Use the search and filter tools to find specific trials
   - Click on any trial to view detailed information

## 📱 User Guide

### Browsing Trials

#### Main Interface
- **Search Bar**: Enter keywords to search across trial titles, descriptions, and locations
- **Status Filters**: Filter by trial status (Recruiting, Active Not Recruiting, Completed, Not specified)
- **Location Filter**: Filter by city/hospital location
- **Study Type Filter**: Filter by study type (Interventional, Observational, etc.)
- **Sort Options**: Sort by title, status, start date, or location

#### Trial Cards
Each trial displays:
- Trial title and current status
- Brief description
- Qualification requirements summary
- Hospital location and contact email
- Study type and estimated duration
- Start and end dates
- "View Details" button for full information

#### Trial Detail Pages
Comprehensive information including:
- Full trial description and objectives
- Complete eligibility criteria
- Study timeline and phase information
- Contact information with direct email links
- Hospital location with Google Maps integration
- Print and share functionality

### Navigation
- **Browse Trials**: Return to main trial listing
- **Physician Community**: Open the private physician discussion forum
- **Admin Login**: Access administrative functions
- **Header Logo**: Always returns to main page
- **Breadcrumb Navigation**: Shows your current location

## 🔧 Admin Guide

### Accessing Admin Panel

1. **Login Process**
   - Click "Admin Login" in the header
   - Use the demo credentials:
     - **Username**: `admin`
     - **Password**: `clinicaltrials2024`
   - Sessions expire after 12 hours of inactivity

2. **Admin Dashboard**
   - View trial statistics and counts
   - Access trial management tools
   - Manage physician accounts and moderation actions
   - Export data functionality

### Managing Trials

#### Adding New Trials
1. Click "Add New Trial" button
2. Fill in any fields you have available (all trial-entry fields are optional)
3. Add `NCTID` when available for universal trial identification
4. Click "Save Trial" to add to the database

#### Editing Existing Trials
1. Find the trial in the admin table
2. Click the "Edit" button (✏️)
3. Modify fields as needed
4. Save changes

#### Deleting Trials
1. Click the "Delete" button (🗑️) for any trial
2. Confirm deletion in the modal dialog
3. Trial will be permanently removed

#### Trial Fields
- Trial-entry fields are optional to reduce data-entry friction
- Authentication and password-change forms still enforce required fields
- If status is not provided, it is stored/displayed as `not_specified` / `Not specified`
- `NCTID` is supported and shown in admin and trial detail views

### Data Management

#### Search and Filter Admin View
- **Search**: Find trials by title, hospital, or other details
- **Status Filter**: Filter admin view by trial status
- Real-time filtering updates the table instantly

#### Export Functionality
- Click "Export JSON" to download all trial data as JSON
- Click "Export CSV" to download all trial data in CSV format
- CSV supports Excel-friendly workflows (open/edit/save as `.csv`)

#### CSV Upload
- Click "Upload CSV" and select a `.csv` file
- Upload replaces the entire trial catalog with the rows in the CSV
- Stable trial ids are preserved when a CSV row matches an existing trial by `id` or `nctId`
- CSV now supports both `cancerType` and `type`; `type` is exported and imported as the physician-community disease group field
- List fields (`secondaryObjectives`, `eligibilityCriteria`) use `|` separator in one cell
- Import is all-or-nothing: if any row is invalid or duplicated, no changes are applied
- Forum threads and replies for trials removed by the new CSV are deleted

#### Data Persistence
- Trial data is saved to `data/trials.json`
- Forum/auth data is saved to a SQLite database
- Changes persist across browsers and sessions
- Admin credentials are migrated out of plain-text config on first secure boot

## 🏗️ Technical Details

### Architecture
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Data Storage**: JSON trial catalog + SQLite for auth/forum state
- **Authentication**: Server-side PHP sessions with cookie-based auth
- **Styling**: Custom CSS with CSS Grid and Flexbox
- **No Dependencies**: No external libraries or frameworks required

### File Structure
```
clinical-trials-website/
├── index.html                 # Main page
├── index-php.html             # Main page (PHP deployment)
├── about-php.html             # About page (PHP deployment)
├── physician-community-php.html # Physician community forum (PHP deployment)
├── physician-login-php.html     # Physician sign-in page
├── trial-detail.html         # Trial details page
├── trial-detail-php.html     # Trial details page (PHP deployment)
├── admin-login.html          # Admin authentication
├── admin-login-php.html      # Admin authentication (PHP deployment)
├── admin-panel.html          # Admin dashboard
├── admin-panel-php.html      # Admin dashboard (PHP deployment)
├── css/
│   ├── styles.css            # Main styles
│   ├── components.css        # Component styles
│   └── admin.css             # Admin-specific styles
├── js/
│   ├── main.js               # Main application logic
│   ├── main-php.js           # Main PHP page logic
│   ├── trial-manager.js      # Data management
│   ├── trial-manager-php.js  # Data management (PHP API)
│   ├── search-filter.js      # Search/filter functionality
│   ├── admin-login-php.js    # Admin login flow
│   ├── physician-login-php.js # Physician login flow
│   ├── admin.js              # Admin panel logic
│   ├── admin-php.js          # Admin panel logic (PHP API)
│   ├── community-prototype-php.js # Physician community forum logic
│   └── utils.js              # Utility functions
├── data/
│   └── trials.json           # Clinical trials database
├── api/
│   ├── auth.php              # Session + login + password change API
│   ├── physicians.php        # Physician management API
│   ├── community.php         # Forum threads/replies API
│   ├── trials.php            # Trial catalog API
│   └── bootstrap.php         # Shared DB/session/bootstrap helpers
└── README.md                 # This file
```

### Browser Compatibility
- **Chrome**: 90+
- **Firefox**: 88+
- **Safari**: 14+
- **Edge**: 90+
- **Mobile browsers**: iOS Safari 14+, Chrome Mobile 90+

### Data Schema
Each trial includes:
```javascript
{
  "id": "unique-identifier",
  "nctId": "NCT01234567",
  "title": "Trial title",
  "description": "Detailed description",
  "qualification": "Requirements summary",
  "status": "recruiting|active_not_recruiting|completed|not_specified",
  "location": {
    "hospital": "Hospital name",
    "city": "City name",
    "state": "State code",
    "zipCode": "ZIP code",
    "address": "Full address"
  },
  "contactEmail": "email@hospital.com",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "estimatedDuration": "Duration description",
  "eligibilityCriteria": ["Criterion 1", "Criterion 2"],
  "primaryObjective": "Main study goal",
  "secondaryObjectives": ["Secondary goal 1"],
  "studyType": "Interventional|Observational|Expanded Access",
  "phase": "Phase I|II|III|IV|N/A",
  "cancerType": "Prostate|Kidney|Bladder|Testicular",
  "sponsor": "Sponsoring organization"
}
```

### CSV Schema
CSV headers:
`id,nctId,title,status,description,qualification,hospital,city,state,zipCode,address,contactEmail,startDate,endDate,estimatedDuration,studyType,phase,cancerType,sponsor,primaryObjective,secondaryObjectives,eligibilityCriteria,lastUpdated`

List fields are pipe-separated in a single cell, for example:
`secondaryObjectives="Objective A | Objective B"`

## 🎨 Customization

### Styling
- Edit CSS files in the `css/` directory
- CSS custom properties (variables) defined in `:root` selector
- Responsive breakpoints: 768px (tablet), 480px (mobile)

### Adding More Trials
- Edit `data/trials.json` to add more sample data
- Use the admin panel to add trials through the interface
- Follow the data schema structure

### Changing Admin Credentials
Edit the credentials in `admin-login.html`:
```javascript
this.credentials = {
  username: 'your-username',
  password: 'your-secure-password'
};
```

## 📊 Sample Data

The website includes 30 realistic clinical trials from major Southern California medical institutions:

### Featured Hospitals
- UCLA Medical Center
- Cedars-Sinai Medical Center  
- USC Keck Medicine
- Kaiser Permanente Los Angeles
- Scripps Health (San Diego)
- Sharp HealthCare (San Diego)
- UC San Diego Health
- Hoag Memorial Hospital (Newport Beach)
- City of Hope (Duarte)
- Children's Hospital Los Angeles

### Trial Categories
- Oncology studies (8 trials)
- Cardiovascular research (6 trials)
- Neurology trials (4 trials)
- Diabetes/Endocrine studies (3 trials)
- Mental health research (3 trials)
- Pediatric trials (3 trials)
- Vaccine studies (3 trials)

## 🔒 Security Notes

### Admin Authentication
- Demo credentials are for testing purposes only
- In production, implement proper server-side authentication
- Session data stored in localStorage with expiration
- No sensitive data transmitted or stored

### Data Protection
- All data processing happens client-side
- No external API calls or data transmission
- Safe to run offline once loaded
- User data never leaves the browser

## 🚀 Deployment Options

### Static Hosting Services
1. **GitHub Pages**: Free hosting directly from repository
2. **Netlify**: Drag-and-drop deployment with custom domains
3. **Vercel**: Git integration with automatic deployments
4. **Firebase Hosting**: Google's static hosting service

### Traditional Web Hosting
- Upload all files to web hosting provider
- Ensure all file permissions are correct
- No special server configuration required

### Local Network Deployment
- Set up simple HTTP server on local machine
- Access via IP address from other devices
- Perfect for internal organization use

## 🐛 Troubleshooting

### Common Issues

**Website not loading properly**
- Ensure all files are in the same directory structure
- Try using an HTTP server instead of opening files directly
- Check browser console for JavaScript errors

**Admin panel not accessible**
- Verify admin credentials are correct
- Check if localStorage is enabled in browser
- Clear browser cache and try again

**Search/filter not working**
- Ensure JavaScript is enabled in browser
- Check for JavaScript errors in console
- Try refreshing the page

**Data not persisting**
- Check if localStorage is available
- Some browsers block localStorage in private mode
- Try using regular browsing mode

**Mobile display issues**
- Ensure viewport meta tag is present
- Test on different mobile devices
- Check CSS media queries

### Performance Optimization
- Enable browser caching for static files
- Compress images if adding custom graphics
- Minify CSS and JavaScript for production
- Use CDN for faster global access

## 📞 Support

For technical support or questions:
1. Check the troubleshooting section above
2. Review browser console for error messages
3. Ensure all files are properly uploaded/configured
4. Test in different browsers to isolate issues

## 📄 License

This project is created for educational and demonstration purposes. The sample clinical trial data is fictional and should not be used for actual medical decisions.

---

**Built with ❤️ for Southern California healthcare research**
