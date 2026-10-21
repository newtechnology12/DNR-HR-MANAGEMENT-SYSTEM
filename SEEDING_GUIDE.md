# DNR HR Management System - Database Seeding Guide

This project includes comprehensive dummy data seeding for testing and development.

## ⚡ Recommended: `npm run seed:demo`

With PocketBase running locally, run `npm run seed:demo` (`scripts/seed-demo.mjs`). It:

- backs up the database first (restore from Admin UI → Settings → Backups)
- creates every collection the frontend uses that is missing (payroll, expenses, petty cash, assets, performance, plans, …) with proper relation fields
- gives each role its permissions and creates the demo logins below
- fills every module with data and can be re-run safely (demo records are regenerated)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@dnr-hr.rw | password123 |
| HR Manager | hr@dnr-hr.rw | password123 |
| Accountant | accountant@dnr-hr.rw | password123 |
| Employee | employee@dnr-hr.rw | password123 |

In dev mode (`npm run dev`) the login page shows one-click buttons for these accounts.

## 📁 Seed Files

| File | Description |
|------|-------------|
| `seed.js` | Standalone Node.js script using PocketBase SDK |
| `pocketbase/pb_migrations/1721000000_seed_data.js` | PocketBase migration file |
| `pocketbase/pb_hooks/seed.js` | PocketBase hook-based seeder |

## 🚀 Quick Start

### Option 1: Standalone Script (Recommended)

1. **Start PocketBase:**
   ```bash
   cd pocketbase
   ./pocketbase serve --http=0.0.0.0:8090
   ```

2. **Run the seed script:**
   ```bash
   # From project root
   node seed.js
   ```

3. **Optional - Set custom credentials:**
   ```bash
   PB_URL=http://127.0.0.1:8090 \
   PB_ADMIN_EMAIL=your-admin@email.com \
   PB_ADMIN_PASSWORD=yourpassword \
   node seed.js
   ```

### Option 2: PocketBase Migration

```bash
cd pocketbase
./pocketbase migrate up
```

### Option 3: PocketBase Hooks (Auto-run on startup)

The hook in `pb_hooks/seed.js` can be triggered manually via a custom API endpoint.

## 📊 What Gets Created

### Core HR Data
- **7 Roles**: Admin, HR Manager, Department Head, Employee, Driver, Accountant, IT Support
- **8 Departments**: HR, IT, Finance, Operations, Sales, Admin, Customer Service, Procurement
- **26 Designations**: Realistic job titles mapped to departments
- **5 Branches**: Kigali Head Office + 4 provincial branches
- **30 Employees**: Distributed across departments, branches, and roles

### Operational Data
- **25 Leave Requests**: Various types (annual, sick, maternity, etc.) with different statuses
- **100 Attendance Records**: Clock in/out with early/late behavior tracking
- **12 Work Periods**: Quarterly and monthly periods for 2024
- **8 Vehicles**: Realistic fleet (Toyota, Nissan, Mitsubishi, Ford, Isuzu)
- **30 Car Requests**: With various purposes, locations, and statuses
- **20 Reports**: Daily, weekly, monthly reports with file references
- **1 Settings Record**: Complete company configuration

## 🔑 Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@dnr-hr.rw | password123 |
| HR Manager | jean.niyonsaba0@dnr-hr.rw | password123 |
| Department Head | marie.uwimana1@dnr-hr.rw | password123 |
| Employee | pierre.mukamana2@dnr-hr.rw | password123 |

*All 30 employees use `password123`*

## 🛠️ Customization

### Modify Seed Data
Edit `seed.js` to customize:
- Number of employees (change `i < 30` loop)
- Date ranges for records
- Company-specific data (names, locations, etc.)
- Salary ranges, leave balances, etc.

### Add New Collections
Follow the pattern in `seed.js`:
```javascript
for (let i = 0; i < COUNT; i++) {
  await pb.collection("collection_name").create({ ...data });
}
```

## 🐳 Docker Usage

```dockerfile
# In your docker-compose.yml
services:
  pocketbase:
    image: ghcr.io/pocketbase/pocketbase:latest
    command: serve --http=0.0.0.0:8090 --dir=/pb_data
    volumes:
      - ./pocketbase:/pb_data
    ports:
      - "8090:8090"
  
  seed:
    build: .
    command: node seed.js
    depends_on:
      - pocketbase
    environment:
      PB_URL: http://pocketbase:8090
      PB_ADMIN_EMAIL: admin@dnr-hr.rw
      PB_ADMIN_PASSWORD: admin123456
```

## 🧪 Testing the Data

After seeding, verify:
1. **Dashboard** - Shows employee stats, attendance, leaves
2. **Employees** - List all 30 employees with filters
3. **Leaves** - View 25 leave requests with approval workflow
4. **Attendance** - See clock in/out records with late/early status
5. **Cars** - Fleet management with 8 vehicles
6. **Car Requests** - 30 requests with approval chain
7. **Reports** - Staff reports by type and date
8. **Settings** - Company configuration

## ⚠️ Troubleshooting

### "Admin not authenticated"
- Ensure PocketBase is running on port 8090
- Check admin credentials in `seed.js` or environment variables
- Create admin first: `./pocketbase superuser upsert admin@dnr-hr.rw password123`

### "Collection not found"
- Run migrations first: `./pocketbase migrate up`
- Check collection names match your schema

### Rate limiting
- The script includes small delays between batch operations
- Increase `sleep(100)` if needed

### Duplicate entries
- Script uses `getFirstListItem` to check existing records
- Safe to run multiple times

## 📝 Notes

- Data uses realistic Rwandan names, locations, and phone formats
- Currency is RWF (Rwandan Francs)
- Timezone: Africa/Kigali
- All passwords are `password123` for easy testing
- Email domain: `@dnr-hr.rw`

## 🔄 Re-seeding

To reset and re-seed:
1. Delete `pocketbase/pb_data/data.db`
2. Restart PocketBase
3. Run seed script again

Or use the migration rollback:
```bash
./pocketbase migrate down 1
./pocketbase migrate up
```