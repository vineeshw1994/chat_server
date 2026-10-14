import config from './index.js';
import { getModels } from '../db/models.js';

const dropDuplicateIndexes = async (sequelize, table) => {
  const [rows] = await sequelize.query(`SHOW INDEX FROM \`${table}\``);
  const byKey = {};
  for (const row of rows) {
    if (row.Key_name === 'PRIMARY') continue;
    if (!byKey[row.Key_name]) {
      byKey[row.Key_name] = { unique: row.Non_unique === 0, cols: [] };
    }
    byKey[row.Key_name].cols.push(row.Column_name);
  }

  const seen = new Set();
  let dropped = 0;
  for (const [name, info] of Object.entries(byKey)) {
    const signature = `${info.unique}:${info.cols.join(',')}`;
    if (seen.has(signature)) {
      await sequelize.query(`ALTER TABLE \`${table}\` DROP INDEX \`${name}\``);
      dropped += 1;
    } else {
      seen.add(signature);
    }
  }
  return dropped;
};

const pruneAllDuplicateIndexes = async (sequelize) => {
  const [tables] = await sequelize.query('SHOW TABLES');
  if (!tables.length) return;
  const tableKey = Object.keys(tables[0])[0];
  let total = 0;
  for (const row of tables) {
    const table = row[tableKey];
    try {
      total += await dropDuplicateIndexes(sequelize, table);
    } catch (err) {
      console.warn(`Index cleanup skipped for ${table}:`, err.message);
    }
  }
  if (total) console.log(`Removed ${total} duplicate MySQL indexes`);
};

const ensureUserAdminColumns = async (sequelize) => {
  const [roleCol] = await sequelize.query("SHOW COLUMNS FROM users LIKE 'role'");
  if (!roleCol.length) {
    await sequelize.query(
      "ALTER TABLE users ADD COLUMN role ENUM('user','admin','staff') NOT NULL DEFAULT 'user'"
    );
  } else {
    await sequelize.query(
      "ALTER TABLE users MODIFY COLUMN role ENUM('user','admin','staff') NOT NULL DEFAULT 'user'"
    );
  }

  const [statusCol] = await sequelize.query("SHOW COLUMNS FROM users LIKE 'status'");
  if (!statusCol.length) {
    await sequelize.query(
      "ALTER TABLE users ADD COLUMN status ENUM('active','banned') NOT NULL DEFAULT 'active'"
    );
  }

  const [permCol] = await sequelize.query("SHOW COLUMNS FROM users LIKE 'permissions'");
  if (!permCol.length) {
    await sequelize.query('ALTER TABLE users ADD COLUMN permissions JSON NULL');
  }

  const [delCol] = await sequelize.query("SHOW COLUMNS FROM users LIKE 'deletedAt'");
  if (!delCol.length) {
    await sequelize.query('ALTER TABLE users ADD COLUMN deletedAt DATETIME NULL');
  }
};

const ensureMessageMentionsColumn = async (sequelize) => {
  const [col] = await sequelize.query("SHOW COLUMNS FROM messages LIKE 'mentions'");
  if (!col.length) {
    await sequelize.query('ALTER TABLE messages ADD COLUMN mentions JSON NULL');
  }
};

const connectDB = async () => {
  try {
    const { sequelize } = getModels();
    await sequelize.authenticate();
    console.log('MySQL connected successfully');

    await pruneAllDuplicateIndexes(sequelize);

    // Do not use sync({ alter: true }) — Sequelize keeps adding indexes until MySQL hits 64 keys.
    await sequelize.sync();
    console.log('Database models synchronized');

    try {
      await ensureUserAdminColumns(sequelize);
      await ensureMessageMentionsColumn(sequelize);
    } catch (colErr) {
      console.warn('Column check:', colErr.message);
    }

    if (config.adminEmail) {
      const { User } = getModels();
      const admin = await User.findOne({ email: config.adminEmail });
      if (!admin) {
        console.log(
          `ADMIN_EMAIL ${config.adminEmail} not found yet. After signup, log in again or refresh — they will be promoted automatically.`
        );
      } else if (admin.role !== 'admin') {
        admin.role = 'admin';
        admin.status = 'active';
        await admin.save();
        console.log(`Promoted ${config.adminEmail} to admin`);
      } else {
        console.log(`Admin ready: ${config.adminEmail}`);
      }
    }
  } catch (error) {
    console.error('MySQL connection error:', error.message);
    process.exit(1);
  }
};

export default connectDB;
