#!/usr/bin/env node
/**
 * DNR HR Management System - Database Seeder
 * 
 * This script seeds the PocketBase database with realistic dummy data
 * for testing and development purposes.
 * 
 * Usage:
 * 1. Start PocketBase: ./pocketbase serve --http=0.0.0.0:8090
 * 2. Run this script: node seed.js
 * 
 * Or run directly with PocketBase:
 * ./pocketbase migrate up (if using as migration)
 */

const fs = require('fs');
const path = require('path');

// Try to load PocketBase SDK
let PocketBase;
try {
  PocketBase = require('pocketbase');
} catch (e) {
  console.error('PocketBase SDK not found. Installing...');
  require('child_process').execSync('npm install pocketbase', { stdio: 'inherit' });
  PocketBase = require('pocketbase');
}

// Configuration
const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@dnr-hr.rw';
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'admin123456';

const pb = new PocketBase(PB_URL);

// Helper functions
const getRandomDate = (start, end) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

const getRandomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getRandomItem = (arr) => arr[getRandomInt(0, arr.length - 1)];

const formatDate = (date) => date.toISOString().replace('T', ' ').split('.')[0];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log('🌱 DNR HR Management System - Database Seeder');
  console.log('==============================================\n');

  try {
    // Authenticate as admin
    console.log('🔐 Authenticating as admin...');
    await pb.admins.authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
    console.log('✅ Admin authenticated\n');

    // ============================================================
    // 1. ROLES
    // ============================================================
    console.log('📋 Creating roles...');
    const roles = [
      { name: "Admin", description: "Full system access" },
      { name: "HR Manager", description: "Manages HR operations" },
      { name: "Department Head", description: "Leads a department" },
      { name: "Employee", description: "Regular employee" },
      { name: "Driver", description: "Company driver" },
      { name: "Accountant", description: "Finance team member" },
      { name: "IT Support", description: "Technical support" },
    ];

    const createdRoles = {};
    for (const role of roles) {
      try {
        const existing = await pb.collection("roles").getFirstListItem(`name="${role.name}"`);
        createdRoles[role.name] = existing;
      } catch (e) {
        const record = await pb.collection("roles").create(role);
        createdRoles[role.name] = record;
      }
    }
    console.log(`   ✅ Created/found ${Object.keys(createdRoles).length} roles\n`);

    // ============================================================
    // 2. DEPARTMENTS
    // ============================================================
    console.log('🏢 Creating departments...');
    const departments = [
      { name: "Human Resources", code: "HR", description: "Manages human resources" },
      { name: "Information Technology", code: "IT", description: "Technology and systems" },
      { name: "Finance & Accounting", code: "FIN", description: "Financial operations" },
      { name: "Operations", code: "OPS", description: "Daily operations" },
      { name: "Sales & Marketing", code: "SAL", description: "Sales and marketing" },
      { name: "Administration", code: "ADM", description: "Administrative functions" },
      { name: "Customer Service", code: "CS", description: "Customer support" },
      { name: "Procurement", code: "PROC", description: "Purchasing and procurement" },
    ];

    const createdDepartments = {};
    for (const dept of departments) {
      try {
        const existing = await pb.collection("departments").getFirstListItem(`name="${dept.name}"`);
        createdDepartments[dept.name] = existing;
      } catch (e) {
        const record = await pb.collection("departments").create({ 
          ...dept, 
          created_by: createdRoles.Admin?.id || "" 
        });
        createdDepartments[dept.name] = record;
      }
    }
    console.log(`   ✅ Created/found ${Object.keys(createdDepartments).length} departments\n`);

    // ============================================================
    // 3. DESIGNATIONS
    // ============================================================
    console.log('💼 Creating designations...');
    const designations = [
      { name: "HR Director", department: createdDepartments["Human Resources"]?.id, description: "Oversees all HR functions" },
      { name: "HR Manager", department: createdDepartments["Human Resources"]?.id, description: "Manages HR operations" },
      { name: "HR Officer", department: createdDepartments["Human Resources"]?.id, description: "Handles HR administration" },
      { name: "Recruitment Specialist", department: createdDepartments["Human Resources"]?.id, description: "Manages hiring processes" },
      { name: "IT Director", department: createdDepartments["Information Technology"]?.id, description: "Leads IT strategy" },
      { name: "Senior Developer", department: createdDepartments["Information Technology"]?.id, description: "Leads development projects" },
      { name: "Software Developer", department: createdDepartments["Information Technology"]?.id, description: "Develops applications" },
      { name: "DevOps Engineer", department: createdDepartments["Information Technology"]?.id, description: "Manages CI/CD and infrastructure" },
      { name: "IT Support Specialist", department: createdDepartments["Information Technology"]?.id, description: "Provides technical support" },
      { name: "Finance Director", department: createdDepartments["Finance & Accounting"]?.id, description: "Oversees financial operations" },
      { name: "Senior Accountant", department: createdDepartments["Finance & Accounting"]?.id, description: "Manages accounting functions" },
      { name: "Accountant", department: createdDepartments["Finance & Accounting"]?.id, description: "Handles financial records" },
      { name: "Payroll Specialist", department: createdDepartments["Finance & Accounting"]?.id, description: "Manages payroll processing" },
      { name: "Operations Manager", department: createdDepartments["Operations"]?.id, description: "Oversees daily operations" },
      { name: "Operations Supervisor", department: createdDepartments["Operations"]?.id, description: "Supervises operational staff" },
      { name: "Operations Coordinator", department: createdDepartments["Operations"]?.id, description: "Coordinates operational activities" },
      { name: "Sales Manager", department: createdDepartments["Sales & Marketing"]?.id, description: "Leads sales team" },
      { name: "Marketing Specialist", department: createdDepartments["Sales & Marketing"]?.id, description: "Manages marketing campaigns" },
      { name: "Sales Representative", department: createdDepartments["Sales & Marketing"]?.id, description: "Handles client relationships" },
      { name: "Admin Manager", department: createdDepartments["Administration"]?.id, description: "Manages administrative functions" },
      { name: "Office Administrator", department: createdDepartments["Administration"]?.id, description: "Handles office operations" },
      { name: "Front Desk Officer", department: createdDepartments["Administration"]?.id, description: "Manages reception" },
      { name: "Customer Service Manager", department: createdDepartments["Customer Service"]?.id, description: "Leads customer support team" },
      { name: "Customer Service Representative", department: createdDepartments["Customer Service"]?.id, description: "Handles customer inquiries" },
      { name: "Procurement Manager", department: createdDepartments["Procurement"]?.id, description: "Manages purchasing" },
      { name: "Procurement Officer", department: createdDepartments["Procurement"]?.id, description: "Handles procurement processes" },
    ];

    const createdDesignations = {};
    for (const desig of designations) {
      if (!desig.department) continue;
      try {
        const existing = await pb.collection("designations").getFirstListItem(`name="${desig.name}"`);
        createdDesignations[desig.name] = existing;
      } catch (e) {
        const record = await pb.collection("designations").create({ 
          ...desig, 
          created_by: createdRoles.Admin?.id || "" 
        });
        createdDesignations[desig.name] = record;
      }
    }
    console.log(`   ✅ Created/found ${Object.keys(createdDesignations).length} designations\n`);

    // ============================================================
    // 4. BRANCHES
    // ============================================================
    console.log('🏬 Creating branches...');
    const branches = [
      { name: "Head Office - Kigali", location: "Kigali, Rwanda", status: "active", description: "Main headquarters", manager: null },
      { name: "North Branch - Musanze", location: "Musanze, Rwanda", status: "active", description: "Northern province branch", manager: null },
      { name: "South Branch - Huye", location: "Huye, Rwanda", status: "active", description: "Southern province branch", manager: null },
      { name: "East Branch - Rwamagana", location: "Rwamagana, Rwanda", status: "active", description: "Eastern province branch", manager: null },
      { name: "West Branch - Karongi", location: "Karongi, Rwanda", status: "active", description: "Western province branch", manager: null },
    ];

    const createdBranches = {};
    for (const branch of branches) {
      try {
        const existing = await pb.collection("branches").getFirstListItem(`name="${branch.name}"`);
        createdBranches[branch.name] = existing;
      } catch (e) {
        const record = await pb.collection("branches").create({ 
          ...branch, 
          created_by: createdRoles.Admin?.id || "" 
        });
        createdBranches[branch.name] = record;
      }
    }
    console.log(`   ✅ Created/found ${Object.keys(createdBranches).length} branches\n`);

    // ============================================================
    // 5. USERS (EMPLOYEES)
    // ============================================================
    console.log('👥 Creating employees...');
    const firstNames = [
      "Jean", "Marie", "Pierre", "Claire", "Paul", "Sophie", "Michel", "Isabelle",
      "Jacques", "Nathalie", "Philippe", "Catherine", "Thomas", "Julie", "Nicolas",
      "Valerie", "Alexandre", "Sandrine", "David", "Caroline", "Laurent", "Virginie",
      "Olivier", "Delphine", "Vincent", "Emilie", "Raphael", "Audrey", "Maxime", "Celine"
    ];

    const lastNames = [
      "Niyonsaba", "Uwimana", "Mukamana", "Nkurunziza", "Ingabire", "Habyarimana",
      "Niyonzima", "Uwase", "Mugabo", "Kwizera", "Manzi", "Mutesi", "Nshimiyimana",
      "Umuhoza", "Nsengiyumva", "Uwamahoro", "Niyitegeka", "Umutesi", "Niyonkuru",
      "Uwimbabazi", "Niyonshuti", "Uwitonze", "Niyomugabo", "Uwase", "Niyonzima"
    ];

    const genders = ["Male", "Female"];
    const employmentTypes = ["permanent", "contract", "probation", "intern", "part-time"];
    const statuses = ["Active", "Active", "Active", "Active", "Inactive", "Suspended"];
    const nationalities = ["Rwandan", "Rwandan", "Rwandan", "Rwandan", "Rwandan", "Congolese", "Burundian", "Ugandan"];

    const adminRole = createdRoles.Admin;
    const hrManagerRole = createdRoles["HR Manager"];
    const deptHeadRole = createdRoles["Department Head"];
    const employeeRole = createdRoles.Employee;
    const driverRole = createdRoles.Driver;
    const accountantRole = createdRoles.Accountant;
    const itSupportRole = createdRoles["IT Support"];

    const createdUsers = [];
    const departmentsList = Object.values(createdDepartments);
    const designationsList = Object.values(createdDesignations);
    const branchesList = Object.values(createdBranches);

    for (let i = 0; i < 30; i++) {
      const firstName = getRandomItem(firstNames);
      const lastName = getRandomItem(lastNames);
      const fullName = `${firstName} ${lastName}`;
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@dnr-hr.rw`;
      const phone = `+2507${getRandomInt(80, 89)}${getRandomInt(100000, 999999)}`;
      const gender = getRandomItem(genders);
      const nationality = getRandomItem(nationalities);
      const employmentType = getRandomItem(employmentTypes);
      const status = getRandomItem(statuses);
      const department = getRandomItem(departmentsList);
      const designation = getRandomItem(designationsList.filter(d => d.department === department.id)) || getRandomItem(designationsList);
      const branch = getRandomItem(branchesList);
      const joinedAt = getRandomDate(new Date("2020-01-01"), new Date("2024-06-01"));
      const birth = getRandomDate(new Date("1970-01-01"), new Date("2000-12-31"));
      const salary = getRandomInt(300000, 2000000);
      const nationalId = `${getRandomInt(1000000000000000, 9999999999999999)}`;

      // Assign roles based on position
      let role = employeeRole;
      if (i === 0) role = adminRole;
      else if (i < 3) role = hrManagerRole;
      else if (i < 8) role = deptHeadRole;
      else if (designation.name.includes("Driver")) role = driverRole;
      else if (designation.name.includes("Accountant")) role = accountantRole;
      else if (designation.name.includes("IT")) role = itSupportRole;

      try {
        const existing = await pb.collection("users").getFirstListItem(`email="${email}"`);
        createdUsers.push(existing);
      } catch (e) {
        const record = await pb.collection("users").create({
          email,
          emailVisibility: true,
          password: "password123",
          passwordConfirm: "password123",
          name: fullName,
          names: fullName,
          phone,
          role: role.id,
          department: department.id,
          designation: designation.id,
          branch: branch.id,
          status,
          gender,
          birth: formatDate(birth),
          nationality,
          national_id: nationalId,
          country: "Rwanda",
          address: `${getRandomItem(["Kigali", "Musanze", "Huye", "Rwamagana", "Karongi"])}, Rwanda`,
          salary: salary.toString(),
          employment_type: employmentType,
          joined_at: formatDate(joinedAt),
          bank_name: getRandomItem(["Bank of Kigali", "Equity Bank", "I&M Bank", "BK", "GT Bank"]),
          bank_account_number: `${getRandomInt(1000000000, 9999999999)}`,
          other_names: "",
          father_name: "",
          mother_name: "",
          place_of_birth: "Kigali, Rwanda",
          certified_academic_documents: "Yes",
          previous_employers: "Previous Company Ltd",
          number_of_dependents: getRandomInt(0, 4).toString(),
          spouse_name: "",
          spouse_telephone: "",
          spouse_email: "",
          spouse_occupation: "",
          spouse_employer: "",
          spouse_position: "",
          spouse_medical_insurance: "",
          spouse_id_passport: "",
          children_names: "",
          recent_tested_diseases: "None",
          physical_handicap: "None",
          ongoing_education: "",
          other_employment: "None",
          business_shareholding: "None",
          bank_accounts: "",
          loans_ongoing: "None",
          recent_pay_slips: "Yes",
          recent_bank_statements: "Yes",
          criminal_record: "None",
        });
        createdUsers.push(record);
      }
      
      // Small delay to avoid rate limiting
      if (i % 5 === 0) await sleep(100);
    }
    console.log(`   ✅ Created/found ${createdUsers.length} users\n`);

    // Update branches with managers
    for (let i = 0; i < Math.min(branchesList.length, createdUsers.length); i++) {
      try {
        await pb.collection("branches").update(branchesList[i].id, { manager: createdUsers[i].id });
      } catch (e) {
        console.log(`   ⚠️ Could not update branch manager: ${e.message}`);
      }
    }

    // ============================================================
    // 6. LEAVE REQUESTS
    // ============================================================
    console.log('🏖️ Creating leave requests...');
    const leaveTypes = ["annual", "maternity", "paternity", "sick", "study", "unpaid", "other"];
    const leaveStatuses = ["pending", "approved", "rejected"];

    for (let i = 0; i < 25; i++) {
      const employee = getRandomItem(createdUsers);
      const type = getRandomItem(leaveTypes);
      const startDate = getRandomDate(new Date("2024-01-01"), new Date("2024-11-30"));
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + getRandomInt(1, 30));
      const reason = getRandomItem([
        "Annual vacation", "Medical appointment", "Family emergency", 
        "Maternity leave", "Paternity leave", "Study leave", 
        "Personal reasons", "Wedding", "Bereavement", "Religious observance"
      ]);

      try {
        await pb.collection("leaves").create({
          employee: employee.id,
          type,
          status: getRandomItem(leaveStatuses),
          start: formatDate(startDate),
          end: formatDate(endDate),
          reason,
          days: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)),
        });
      } catch (e) {
        console.log(`   ⚠️ Failed to create leave: ${e.message}`);
      }
    }
    console.log('   ✅ Created leave requests\n');

    // ============================================================
    // 7. ATTENDANCE RECORDS
    // ============================================================
    console.log('⏰ Creating attendance records...');
    for (let i = 0; i < 100; i++) {
      const employee = getRandomItem(createdUsers);
      const date = getRandomDate(new Date("2024-01-01"), new Date("2024-12-15"));
      
      const clockInHour = getRandomInt(7, 10);
      const clockInMin = getRandomInt(0, 59);
      const clockOutHour = getRandomInt(16, 19);
      const clockOutMin = getRandomInt(0, 59);

      const clockIn = new Date(date);
      clockIn.setHours(clockInHour, clockInMin, 0, 0);
      
      const clockOut = new Date(date);
      clockOut.setHours(clockOutHour, clockOutMin, 0, 0);

      const behaviour = clockInHour > 8 ? "late" : "early";

      try {
        await pb.collection("attendance").create({
          employee: employee.id,
          branch: employee.branch,
          type: getRandomItem(["manual", "biometric", "mobile"]),
          clockin_time: formatDate(clockIn),
          clockout_time: formatDate(clockOut),
          date: formatDate(date),
          behaviour,
          notes: getRandomItem(["", "Normal day", "Meeting with client", "Training session", "Field visit", "Remote work"]),
        });
      } catch (e) {
        console.log(`   ⚠️ Failed to create attendance: ${e.message}`);
      }
    }
    console.log('   ✅ Created attendance records\n');

    // ============================================================
    // 8. CARS
    // ============================================================
    console.log('🚗 Creating vehicles...');
    const carModels = [
      { carName: "Toyota Land Cruiser", carModel: "2022", carType: "SUV", carColor: "White", carPrice: 85000000, carDescription: "Executive SUV for management", carStatus: true },
      { carName: "Toyota Hilux", carModel: "2023", carType: "Pickup", carColor: "Silver", carPrice: 45000000, carDescription: "Utility vehicle for field operations", carStatus: true },
      { carName: "Nissan Patrol", carModel: "2022", carType: "SUV", carColor: "Black", carPrice: 78000000, carDescription: "Off-road capable vehicle", carStatus: true },
      { carName: "Toyota Corolla", carModel: "2023", carType: "Sedan", carColor: "Blue", carPrice: 28000000, carDescription: "Fuel efficient city car", carStatus: true },
      { carName: "Mitsubishi Pajero", carModel: "2021", carType: "SUV", carColor: "Gray", carPrice: 52000000, carDescription: "Field operations vehicle", carStatus: true },
      { carName: "Isuzu D-Max", carModel: "2023", carType: "Pickup", carColor: "Red", carPrice: 38000000, carDescription: "Heavy duty pickup", carStatus: true },
      { carName: "Toyota RAV4", carModel: "2022", carType: "SUV", carColor: "White", carPrice: 35000000, carDescription: "Compact SUV for staff transport", carStatus: true },
      { carName: "Ford Ranger", carModel: "2023", carType: "Pickup", carColor: "Blue", carPrice: 42000000, carDescription: "Project site vehicle", carStatus: true },
    ];

    const createdCars = [];
    for (const car of carModels) {
      try {
        const existing = await pb.collection("cars").getFirstListItem(`carName="${car.carName}" && carModel="${car.carModel}"`);
        createdCars.push(existing);
      } catch (e) {
        const record = await pb.collection("cars").create({
          ...car,
          carowner: "DNR HR Management",
          carownerId: createdRoles.Admin?.id,
          carCreatedAt: formatDate(new Date()),
          carUpdatedAt: formatDate(new Date()),
        });
        createdCars.push(record);
      }
    }
    console.log(`   ✅ Created/found ${createdCars.length} cars\n`);

    // ============================================================
    // 9. CAR REQUESTS
    // ============================================================
    console.log('🚙 Creating car requests...');
    const requestStatuses = ["PENDING", "APPROVED", "REJECTED", "COMPLETED", "CANCELLED"];
    const locations = [
      "Kigali Head Office", "Kigali Airport", "Kigali CBD", "Musanze Branch",
      "Huye Branch", "Rwamagana Branch", "Karongi Branch", "Client Site - Bugesera",
      "Client Site - Rubavu", "Client Site - Nyagatare", "Hotel - Kigali Marriott",
      "Hotel - Serena Kigali", "Ministry of Health", "Rwanda Development Board",
      "Kigali Convention Centre"
    ];

    for (let i = 0; i < 30; i++) {
      const employee = getRandomItem(createdUsers);
      const car = getRandomItem(createdCars);
      const startDate = getRandomDate(new Date("2024-01-01"), new Date("2024-12-31"));
      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + getRandomInt(2, 48));

      try {
        await pb.collection("CarRequests").create({
          employee: employee.id,
          car: car.id,
          fromLocation: getRandomItem(locations),
          toLocation: getRandomItem(locations),
          purpose: getRandomItem([
            "Client meeting", "Site inspection", "Training attendance",
            "Conference", "Field visit", "Document delivery", "Staff transport",
            "Airport pickup", "Office supplies", "Emergency response"
          ]),
          startTime: formatDate(startDate),
          endTime: formatDate(endDate),
          passengerCount: getRandomInt(1, 6),
          needsDriver: getRandomItem([true, false]),
          status: getRandomItem(requestStatuses),
        });
      } catch (e) {
        console.log(`   ⚠️ Failed to create car request: ${e.message}`);
      }
    }
    console.log('   ✅ Created car requests\n');

    // ============================================================
    // 10. REPORTS
    // ============================================================
    console.log('📊 Creating reports...');
    const reportTypes = ["daily", "weekly", "monthly", "other"];
    const fileTypes = ["doc", "sheet", "pdf", "other"];

    for (let i = 0; i < 20; i++) {
      const employee = getRandomItem(createdUsers);
      const type = getRandomItem(reportTypes);
      const date = getRandomDate(new Date("2024-01-01"), new Date("2024-12-31"));

      try {
        await pb.collection("reports").create({
          staffId: employee.id,
          name: employee.name,
          type,
          date: formatDate(date),
          description: getRandomItem([
            "Daily activity report", "Weekly progress summary", "Monthly performance review",
            "Project status update", "Financial report", "HR metrics report",
            "IT incident report", "Operations summary", "Sales pipeline update",
            "Compliance audit findings"
          ]),
          fileUrl: `https://example.com/reports/report_${i + 1}.${getRandomItem(fileTypes)}`,
          fileType: getRandomItem(fileTypes),
        });
      } catch (e) {
        console.log(`   ⚠️ Failed to create report: ${e.message}`);
      }
    }
    console.log('   ✅ Created reports\n');

    // ============================================================
    // 11. SETTINGS
    // ============================================================
    console.log('⚙️ Creating settings...');
    try {
      await pb.collection("settings").create({
        work_start_time: "08:00",
        work_end_time: "17:00",
        early_clockin_mins: 15,
        late_threshold_mins: 10,
        leaves_per_year: 21,
        max_carryover_leaves: 5,
        probation_period_months: 3,
        notice_period_days: 30,
        overtime_rate: 1.5,
        weekend_overtime_rate: 2.0,
        holiday_overtime_rate: 2.5,
        mileage_rate_per_km: 250,
        daily_allowance_local: 15000,
        daily_allowance_international: 150000,
        company_name: "DNR HR Management System",
        company_address: "Kigali, Rwanda",
        company_phone: "+250788123456",
        company_email: "hr@dnr-hr.rw",
        currency: "RWF",
        timezone: "Africa/Kigali",
      });
      console.log('   ✅ Created settings\n');
    } catch (e) {
      console.log(`   ℹ️ Settings might already exist: ${e.message}\n`);
    }

    // ============================================================
    // 12. WORK PERIODS
    // ============================================================
    console.log('📅 Creating work periods...');
    const periods = [
      { name: "Q1 2024", start_date: "2024-01-01 00:00:00", end_date: "2024-03-31 23:59:59", status: "closed" },
      { name: "Q2 2024", start_date: "2024-04-01 00:00:00", end_date: "2024-06-30 23:59:59", status: "closed" },
      { name: "Q3 2024", start_date: "2024-07-01 00:00:00", end_date: "2024-09-30 23:59:59", status: "active" },
      { name: "Q4 2024", start_date: "2024-10-01 00:00:00", end_date: "2024-12-31 23:59:59", status: "upcoming" },
      { name: "January 2024", start_date: "2024-01-01 00:00:00", end_date: "2024-01-31 23:59:59", status: "closed" },
      { name: "February 2024", start_date: "2024-02-01 00:00:00", end_date: "2024-02-29 23:59:59", status: "closed" },
      { name: "March 2024", start_date: "2024-03-01 00:00:00", end_date: "2024-03-31 23:59:59", status: "closed" },
      { name: "April 2024", start_date: "2024-04-01 00:00:00", end_date: "2024-04-30 23:59:59", status: "closed" },
      { name: "May 2024", start_date: "2024-05-01 00:00:00", end_date: "2024-05-31 23:59:59", status: "closed" },
      { name: "June 2024", start_date: "2024-06-01 00:00:00", end_date: "2024-06-30 23:59:59", status: "closed" },
      { name: "July 2024", start_date: "2024-07-01 00:00:00", end_date: "2024-07-31 23:59:59", status: "active" },
      { name: "August 2024", start_date: "2024-08-01 00:00:00", end_date: "2024-08-31 23:59:59", status: "active" },
    ];

    for (const period of periods) {
      try {
        await pb.collection("work_periods").create(period);
      } catch (e) {
        console.log(`   ℹ️ Work period might exist: ${e.message}`);
      }
    }
    console.log('   ✅ Created work periods\n');

    // ============================================================
    // SUMMARY
    // ============================================================
    console.log('================================================');
    console.log('🎉 SEEDING COMPLETE!');
    console.log('================================================');
    console.log('\n📋 Summary:');
    console.log(`   • ${Object.keys(createdRoles).length} Roles`);
    console.log(`   • ${Object.keys(createdDepartments).length} Departments`);
    console.log(`   • ${Object.keys(createdDesignations).length} Designations`);
    console.log(`   • ${Object.keys(createdBranches).length} Branches`);
    console.log(`   • ${createdUsers.length} Employees`);
    console.log(`   • 25 Leave Requests`);
    console.log(`   • 100 Attendance Records`);
    console.log(`   • ${createdCars.length} Vehicles`);
    console.log(`   • 30 Car Requests`);
    console.log(`   • 20 Reports`);
    console.log(`   • 1 Settings Record`);
    console.log(`   • 12 Work Periods`);
    console.log('\n🔑 Default Login Credentials:');
    console.log('   Admin: admin@dnr-hr.rw / password123');
    console.log('   Employees: firstname.lastnameN@dnr-hr.rw / password123');
    console.log('\n✨ You can now test the application with realistic data!');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

main();