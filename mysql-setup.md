# Step-by-Step Tutorial: Migrating MySQL from cPanel to DigitalOcean Droplet with Dual-Write Sync

## 📌 Overview
This tutorial will guide you through:
1. Installing MySQL on your DigitalOcean droplet
2. Exporting/importing your cPanel database
3. Setting up dual-write Prisma clients
4. Updating your Flutter app
5. Maintaining cPanel sync

---

## 🚀 Step 1: Install MySQL on DigitalOcean Droplet

### 1.1 Connect to your droplet
```bash
ssh root@your-droplet-ip
```

### 1.2 Install MySQL
```bash
sudo apt update
sudo apt install mysql-server -y
```

### 1.3 Secure MySQL installation
```bash
sudo mysql_secure_installation
```
Follow prompts to set root password and security options.

### 1.4 Create a database and user
```bash
sudo mysql -u root -p
```
```sql
CREATE DATABASE your_db_name;
CREATE USER 'your_user'@'%' IDENTIFIED BY 'strong_password';
GRANT ALL PRIVILEGES ON your_db_name.* TO 'your_user'@'%';
FLUSH PRIVILEGES;
EXIT;
```

### 1.5 Enable remote connections
Edit MySQL config:
```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```
Change `bind-address` to:
```
bind-address = 0.0.0.0
```
Then restart MySQL:
```bash
sudo systemctl restart mysql
```

### 1.6 Open firewall (if using UFW)
```bash
sudo ufw allow 3306
```

---

## 📤 Step 2: Export cPanel Database

### 2.1 Export from phpMyAdmin
1. Log in to cPanel
2. Open phpMyAdmin
3. Select your database
4. Click "Export" → "Quick" → "Go"

### 2.2 (Alternative) Export via SSH
If you have SSH access:
```bash
mysqldump -u cpanel_user -p your_db_name > backup.sql
```

---

## 📥 Step 3: Import to Droplet MySQL

### 3.1 Transfer the SQL file to your droplet
```bash
scp backup.sql root@your-droplet-ip:/root
```

### 3.2 Import the database
```bash
mysql -u your_user -p your_db_name < backup.sql
```

---

## 🔄 Step 4: Set Up Dual-Write Prisma Clients

### 4.1 Install additional Prisma dependencies
```bash
npm install @prisma/client
```

### 4.2 Create dual Prisma configurations

`prisma/schema.prisma` (for primary DB):
```prisma
datasource db {
  provider = "mysql"
  url      = "mysql://your_user:strong_password@your-droplet-ip:3306/your_db_name"
}

// Your models here...
```

`prisma/schema_backup.prisma` (for cPanel):
```prisma
datasource db {
  provider = "mysql"
  url      = "mysql://cpanel_user:cpanel_password@cpanel-server-ip:3306/cpanel_db_name"
}

// Same models as above
```

### 4.3 Generate clients
```bash
npx prisma generate
npx prisma generate --schema=./prisma/schema_backup.prisma
```

### 4.4 Create client files

`src/prismaPrimary.ts`:
```typescript
import { PrismaClient } from '@prisma/client'
export const prismaPrimary = new PrismaClient()
```

`src/prismaBackup.ts`:
```typescript
import { PrismaClient } from '@prisma/client/backup'
export const prismaBackup = new PrismaClient()
```

### 4.5 Implement dual writes in your API

Example user creation endpoint:
```typescript
import { prismaPrimary, prismaBackup } from '../prisma'

app.post('/users', async (req, res) => {
  try {
    // Write to primary DB
    const newUser = await prismaPrimary.user.create({
      data: req.body
    });
    
    // Write to backup DB (with error handling)
    try {
      await prismaBackup.user.create({
        data: req.body
      });
    } catch (backupError) {
      console.error('Backup DB write failed:', backupError);
      // Consider logging this to a monitoring service
    }
    
    res.json(newUser);
  } catch (error) {
    res.status(500).json({ error: 'Creation failed' });
  }
});
```

---

## 📱 Step 5: Update Flutter App

### 5.1 Update `baseUrl`
In your Flutter app's API client:
```dart
final baseUrl = 'http://your-droplet-ip:3000'; // or your domain
```

### 5.2 (Optional) Add automatic failover
```dart
class ApiClient {
  static const primaryUrl = 'http://your-droplet-ip:3000';
  static const backupUrl = 'http://your-cpanel-domain/api';
  
  Future<Response> request(String method, String path) async {
    try {
      return await _sendRequest(method, primaryUrl + path);
    } catch (e) {
      // Fallback to backup if primary fails
      return await _sendRequest(method, backupUrl + path);
    }
  }
}
```

---

## 🔄 Step 6: Verify Sync is Working

### 6.1 Test writes
1. Make an API request that creates data
2. Check both databases:
   ```bash
   # On droplet
   mysql -u your_user -p -e "SELECT * FROM your_table LIMIT 1;" your_db_name
   
   # On cPanel (via phpMyAdmin or SSH)
   ```

### 6.2 Set up monitoring (optional)
Create a health check endpoint:
```typescript
app.get('/health', async (req, res) => {
  const primaryHealth = await prismaPrimary.$queryRaw`SELECT 1`;
  let backupHealth;
  
  try {
    backupHealth = await prismaBackup.$queryRaw`SELECT 1`;
  } catch (e) {
    backupHealth = { status: 'unhealthy' };
  }
  
  res.json({
    primary: 'healthy',
    backup: backupHealth ? 'healthy' : 'unhealthy'
  });
});
```

---

## 🛠 Troubleshooting

**Problem**: Can't connect to cPanel MySQL remotely  
**Solution**:  
1. In cPanel → Remote MySQL → Add your droplet IP  
2. Check with your host if remote connections are allowed

**Problem**: Backup writes are slow  
**Solution**:  
- Wrap backup writes in a try/catch and don't await them:
  ```typescript
  // Fire-and-forget backup write
  prismaBackup.user.create({ data }).catch(console.error);
  ```

**Problem**: Schema drift between databases  
**Solution**:  
- Regularly run:
  ```bash
  npx prisma migrate deploy --schema=./prisma/schema_backup.prisma
  ```

---

## 🎉 Final Notes

1. **Monitor sync status** regularly for the first few weeks
2. **Consider a full backup** before major schema changes
3. **For production**, add retry logic for failed backup writes

Would you like me to provide any specific part in more detail?