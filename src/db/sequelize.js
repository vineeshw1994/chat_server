import { Sequelize } from 'sequelize';
import config from '../config/index.js';

const sequelize = new Sequelize(
  config.db.database,
  config.db.username,
  config.db.password,
  {
    host: config.db.host,
    port: config.db.port,
    dialect: 'mysql',
    logging: config.nodeEnv === 'development' ? false : false,
    define: {
      timestamps: true,
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

export default sequelize;
