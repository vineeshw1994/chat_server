import config from './index.js';
import { getModels } from '../db/models.js';

const connectDB = async () => {
  try {
    const { sequelize } = getModels();
    await sequelize.authenticate();
    console.log('MySQL connected successfully');

    await sequelize.sync({ alter: config.nodeEnv === 'development' });
    console.log('Database models synchronized');
  } catch (error) {
    console.error('MySQL connection error:', error.message);
    process.exit(1);
  }
};

export default connectDB;
