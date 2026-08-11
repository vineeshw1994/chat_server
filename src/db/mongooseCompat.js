import { Op } from 'sequelize';
import sequelize from './sequelize.js';
import { DataTypes, Model } from 'sequelize';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// ─── Helpers ───────────────────────────────────────────────────────────────

const wrapDoc = (instance, ModelClass) => {
  if (!instance) return null;
  if (Array.isArray(instance)) return instance.map((i) => wrapDoc(i, ModelClass));
  if (!(instance instanceof Model)) return instance;

  const doc = instance;
  Object.defineProperty(doc, '_id', {
    get() {
      return this.id;
    },
    configurable: true,
  });

  doc.toObject = function toObject() {
    const o = { ...this.get({ plain: true }) };
    o._id = o.id;
    return o;
  };

  if (ModelClass._wrapInstance) ModelClass._wrapInstance(doc);
  return doc;
};

const parseSelect = (sel) => {
  if (!sel) return undefined;
  if (typeof sel === 'string') {
    if (sel.startsWith('+')) return { includePassword: sel.slice(1) };
    return sel.split(/\s+/).filter(Boolean).map((f) => (f === '_id' ? 'id' : f));
  }
  return undefined;
};

const buildWhere = (query, opts = {}) => {
  const { jsonArrays = [], jsonMaps = [] } = opts;
  if (!query || typeof query !== 'object') return {};

  const parts = [];

  for (const [rawKey, val] of Object.entries(query)) {
    const key = rawKey === '_id' ? 'id' : rawKey;

    if (rawKey === '$or') {
      parts.push({ [Op.or]: val.map((q) => buildWhere(q, opts)) });
      continue;
    }

    // JSON array: { participants: userId }
    if (jsonArrays.includes(key) && (typeof val === 'string' || typeof val === 'number')) {
      parts.push(
        sequelize.literal(
          `JSON_CONTAINS(\`${key}\`, JSON_QUOTE('${String(val).replace(/'/g, "''")}'))`
        )
      );
      continue;
    }

    // JSON array: { deletedFor: { $ne: id } }
    if (jsonArrays.includes(key) && val?.$ne !== undefined) {
      parts.push(
        sequelize.literal(
          `NOT JSON_CONTAINS(\`${key}\`, JSON_QUOTE('${String(val.$ne).replace(/'/g, "''")}'))`
        )
      );
      continue;
    }

    // JSON array: { seenBy: { $ne: id } }  (same as above)
    if (jsonArrays.includes(key) && val?.$ne !== undefined) {
      continue;
    }

    // Friendship users: { users: { $all: [a,b] } }
    if (key === 'users' && val?.$all) {
      val.$all.forEach((id) => {
        parts.push(
          sequelize.literal(
            `JSON_CONTAINS(\`users\`, JSON_QUOTE('${String(id).replace(/'/g, "''")}'))`
          )
        );
      });
      continue;
    }

    // Chat participants: { $all: [...], $size: 2 }
    if (jsonArrays.includes(key) && val?.$all && val?.$size !== undefined) {
      parts.push(sequelize.literal(`JSON_LENGTH(\`${key}\`) = ${Number(val.$size)}`));
      val.$all.forEach((id) => {
        parts.push(
          sequelize.literal(
            `JSON_CONTAINS(\`${key}\`, JSON_QUOTE('${String(id).replace(/'/g, "''")}'))`
          )
        );
      });
      continue;
    }

    if (jsonArrays.includes(key) && val?.$all) {
      val.$all.forEach((id) => {
        parts.push(
          sequelize.literal(
            `JSON_CONTAINS(\`${key}\`, JSON_QUOTE('${String(id).replace(/'/g, "''")}'))`
          )
        );
      });
      continue;
    }

    // Call participants in $or queries handled at top level

    if (val instanceof RegExp) {
      parts.push({ [key]: { [Op.regexp]: val.source } });
      continue;
    }

    if (val && typeof val === 'object' && !(val instanceof Date)) {
      if ('$ne' in val) {
        parts.push({ [key]: { [Op.ne]: val.$ne } });
        continue;
      }
      if ('$gt' in val) {
        parts.push({ [key]: { [Op.gt]: val.$gt } });
        continue;
      }
      if ('$in' in val) {
        parts.push({ [key]: { [Op.in]: val.$in } });
        continue;
      }
    }

    if (key === 'email' && typeof val === 'string') {
      parts.push({ [key]: val.toLowerCase() });
      continue;
    }

    parts.push({ [key]: val });
  }

  if (!parts.length) return {};
  if (parts.length === 1) return parts[0];
  return { [Op.and]: parts };
};

// ─── Query builder (chainable) ─────────────────────────────────────────────

class QueryBuilder {
  constructor(ModelClass, method, arg, opts = {}) {
    this.ModelClass = ModelClass;
    this.method = method;
    this.arg = arg;
    this.opts = opts;
    this._sort = null;
    this._skip = 0;
    this._limit = null;
    this._select = null;
    this._populates = [];
  }

  sort(s) {
    this._sort = s;
    return this;
  }

  skip(n) {
    this._skip = n;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  select(s) {
    this._select = s;
    return this;
  }

  populate(path, select) {
    if (typeof path === 'object' && path.path) {
      this._populates.push(path);
    } else {
      this._populates.push({ path, select });
    }
    return this;
  }

  lean() {
    this._lean = true;
    return this;
  }

  async exec() {
    return this._run();
  }

  then(resolve, reject) {
    return this._run().then(resolve, reject);
  }

  async _run() {
    const M = this.ModelClass;
    const sel = parseSelect(this._select);
    let attributes;
    let includePassword = false;

    if (sel?.includePassword) {
      includePassword = true;
      attributes = undefined;
    } else if (Array.isArray(sel)) {
      attributes = sel;
    }

    const order = this._sort
      ? Object.entries(this._sort).map(([k, d]) => [k, d === -1 ? 'DESC' : 'ASC'])
      : undefined;

    let result;

    if (this.method === 'find') {
      result = await M._sequelize.findAll({
        where: buildWhere(this.arg, M._queryOpts),
        attributes: attributes ?? (M._name === 'User' && !includePassword ? { exclude: ['password'] } : attributes),
        order,
        offset: this._skip,
        limit: this._limit,
      });
      result = result.map((r) => wrapDoc(r, M));
    } else if (this.method === 'findOne') {
      result = await M._sequelize.findOne({
        where: buildWhere(this.arg, M._queryOpts),
        attributes: attributes ?? (M._name === 'User' && !includePassword ? { exclude: ['password'] } : attributes),
        order,
      });
      result = wrapDoc(result, M);
    } else if (this.method === 'findById') {
      result = await M._sequelize.findByPk(this.arg, {
        attributes: attributes ?? (M._name === 'User' && !includePassword ? { exclude: ['password'] } : attributes),
      });
      result = wrapDoc(result, M);
    }

    if (includePassword && result) {
      // password always in table; just not excluded
    } else if (M._name === 'User' && attributes && !attributes.includes('password')) {
      // default exclude password handled by attributes list
    }

    for (const pop of this._populates) {
      if (Array.isArray(result)) {
        await Promise.all(result.map((doc) => M._applyPopulate(doc, pop)));
      } else if (result) {
        await M._applyPopulate(result, pop);
      }
    }

    if (this._lean && result) {
      if (Array.isArray(result)) return result.map((d) => d.toObject());
      return result.toObject();
    }

    return result;
  }
}

// ─── Compat model factory ──────────────────────────────────────────────────

export const createCompatModel = (sequelizeModel, config = {}) => {
  const {
    name,
    jsonArrayFields = [],
    jsonMapFields = [],
    populateConfig = {},
    hooks = {},
  } = config;

  class CompatModel {
    static _sequelize = sequelizeModel;
    static _name = name;
    static _queryOpts = { jsonArrays: jsonArrayFields };
    static _populateConfig = populateConfig;
    static _jsonMapFields = jsonMapFields;
    static _hooks = hooks;

    static find(filter = {}) {
      return new QueryBuilder(this, 'find', filter);
    }

    static findOne(filter = {}) {
      return new QueryBuilder(this, 'findOne', filter);
    }

    static findById(id) {
      return new QueryBuilder(this, 'findById', id);
    }

    static async create(data) {
      const payload = { id: uuidv4(), ...data };
      if (hooks.beforeCreate) hooks.beforeCreate(payload);
      const row = await sequelizeModel.create(payload);
      return wrapDoc(row, this);
    }

    static async exists(filter) {
      const count = await sequelizeModel.count({ where: buildWhere(filter, this._queryOpts) });
      return count > 0 ? { _id: true } : null;
    }

    static async countDocuments(filter = {}) {
      return sequelizeModel.count({ where: buildWhere(filter, this._queryOpts) });
    }

    static async insertMany(items) {
      const rows = items.map((item) => ({ id: uuidv4(), ...item }));
      await sequelizeModel.bulkCreate(rows);
      return rows;
    }

    static async deleteOne(filter) {
      return sequelizeModel.destroy({ where: buildWhere(filter, this._queryOpts) });
    }

    static async deleteMany(filter) {
      return sequelizeModel.destroy({ where: buildWhere(filter, this._queryOpts) });
    }

    static async updateOne(filter, update) {
      const [n] = await sequelizeModel.update(update.$set || update, {
        where: buildWhere(filter, this._queryOpts),
      });
      return { modifiedCount: n };
    }

    static async updateMany(filter, update) {
      if (update.$addToSet) {
        const docs = await sequelizeModel.findAll({ where: buildWhere(filter, this._queryOpts) });
        for (const doc of docs) {
          const plain = doc.get({ plain: true });
          for (const [field, val] of Object.entries(update.$addToSet)) {
            const arr = plain[field] || [];
            const id = val.$each ? val.$each[0] : val;
            if (!arr.map(String).includes(String(id))) arr.push(id);
            plain[field] = arr;
          }
          if (update.$set) Object.assign(plain, update.$set);
          await sequelizeModel.update(plain, { where: { id: plain.id } });
        }
        return { modifiedCount: docs.length };
      }
      const [n] = await sequelizeModel.update(update.$set || update, {
        where: buildWhere(filter, this._queryOpts),
      });
      return { modifiedCount: n };
    }

    static async findByIdAndUpdate(id, update, options = {}) {
      const row = await sequelizeModel.findByPk(id);
      if (!row) return null;
      Object.assign(row, update.$set || update);
      if (hooks.beforeSave) hooks.beforeSave(row);
      await row.save();
      const doc = wrapDoc(row, this);
      return options.new !== false ? doc : doc;
    }

    static async findOneAndUpdate(filter, data, options = {}) {
      let row = await sequelizeModel.findOne({ where: buildWhere(filter, this._queryOpts) });
      if (!row && options.upsert) {
        row = await sequelizeModel.create({ id: uuidv4(), ...filter, ...data });
      } else if (row) {
        Object.assign(row, data);
        await row.save();
      }
      return wrapDoc(row, this);
    }

    static _wrapInstance(doc) {
      if (jsonMapFields.length) {
        for (const field of jsonMapFields) {
          const raw = doc.get(field);
          if (raw && !(raw instanceof Map)) {
            const map = new Map(Object.entries(typeof raw === 'object' ? raw : {}));
            doc.setDataValue(field, map);
            Object.defineProperty(doc, field, {
              get() {
                return this.getDataValue(field);
              },
              set(v) {
                this.setDataValue(field, v instanceof Map ? v : new Map(Object.entries(v || {})));
              },
              configurable: true,
            });
          }
        }
      }
      if (hooks.wrapInstance) hooks.wrapInstance(doc);
    }

    static async _applyPopulate(doc, pop) {
      if (!doc) return;
      const path = pop.path;
      const cfg = this._populateConfig[path];
      if (!cfg) return;

      const select = pop.select || pop.populate?.select;
      const attrs = select
        ? select.split(/\s+/).map((f) => (f === '_id' ? 'id' : f))
        : undefined;

      if (cfg.type === 'array') {
        const ids = doc.get(path) || [];
        const users = await cfg.model.findAll({
          where: { id: { [Op.in]: ids } },
          attributes: attrs,
        });
        const mapped = ids
          .map((id) => users.find((u) => String(u.id) === String(id)))
          .filter(Boolean)
          .map((u) => wrapDoc(u, cfg.compatModel));
        doc.setDataValue(path, mapped);
      } else if (cfg.type === 'ref') {
        const refId = doc.get(path);
        if (!refId) return;
        const related = await cfg.model.findByPk(refId, { attributes: attrs });
        doc.setDataValue(path, wrapDoc(related, cfg.compatModel));

        if (pop.populate) {
          await this._applyPopulate(doc.get(path), pop.populate);
        }
      }
    }
  }

  return CompatModel;
};

// ─── Sequelize model definitions ───────────────────────────────────────────

export const initModels = () => {
  const UserSequelize = sequelize.define(
    'User',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      name: { type: DataTypes.STRING(80), allowNull: false },
      username: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      mobile: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
      profilePicture: { type: DataTypes.STRING(500), defaultValue: '' },
      bio: { type: DataTypes.STRING(300), defaultValue: '' },
      statusMessage: { type: DataTypes.STRING(140), defaultValue: 'Hey there! I am using ChatApp.' },
      isOnline: { type: DataTypes.BOOLEAN, defaultValue: false },
      lastSeen: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
      socketId: { type: DataTypes.STRING(100), allowNull: true },
      settings: {
        type: DataTypes.JSON,
        defaultValue: {
          autoDownloadPhotos: 'wifi',
          autoDownloadVideos: 'wifi',
          autoDownloadFiles: 'never',
          autoDownloadVoice: 'always',
          notificationSound: true,
          messagePreview: true,
          showOnlineStatus: true,
          readReceipts: true,
          saveToGallery: false,
        },
      },
    },
    { tableName: 'users' }
  );

  const OTPSequelize = sequelize.define(
    'OTP',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      email: { type: DataTypes.STRING(255), allowNull: false },
      code: { type: DataTypes.STRING(10), allowNull: false },
      purpose: { type: DataTypes.ENUM('signup', 'forgot_password', 'resend'), allowNull: false },
      expiresAt: { type: DataTypes.DATE, allowNull: false },
      isUsed: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    { tableName: 'otps' }
  );

  const ChatSequelize = sequelize.define(
    'Chat',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      type: { type: DataTypes.ENUM('private', 'group'), allowNull: false },
      participants: { type: DataTypes.JSON, defaultValue: [] },
      group: { type: DataTypes.UUID, allowNull: true },
      lastMessage: { type: DataTypes.UUID, allowNull: true },
      lastMessageAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      pinnedBy: { type: DataTypes.JSON, defaultValue: [] },
      archivedBy: { type: DataTypes.JSON, defaultValue: [] },
      unreadCounts: { type: DataTypes.JSON, defaultValue: {} },
    },
    { tableName: 'chats' }
  );

  const MessageSequelize = sequelize.define(
    'Message',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      chat: { type: DataTypes.UUID, allowNull: false },
      sender: { type: DataTypes.UUID, allowNull: false },
      type: {
        type: DataTypes.ENUM('text', 'image', 'video', 'audio', 'voice', 'document', 'system'),
        defaultValue: 'text',
      },
      content: { type: DataTypes.TEXT, defaultValue: '' },
      fileUrl: { type: DataTypes.STRING(500), defaultValue: '' },
      fileName: { type: DataTypes.STRING(255), defaultValue: '' },
      fileSize: { type: DataTypes.INTEGER, defaultValue: 0 },
      mimeType: { type: DataTypes.STRING(100), defaultValue: '' },
      isVoiceNote: { type: DataTypes.BOOLEAN, defaultValue: false },
      replyTo: { type: DataTypes.UUID, allowNull: true },
      forwardedFrom: { type: DataTypes.UUID, allowNull: true },
      status: { type: DataTypes.ENUM('sent', 'delivered', 'seen'), defaultValue: 'sent' },
      deliveredTo: { type: DataTypes.JSON, defaultValue: [] },
      seenBy: { type: DataTypes.JSON, defaultValue: [] },
      deletedFor: { type: DataTypes.JSON, defaultValue: [] },
      deletedForEveryone: { type: DataTypes.BOOLEAN, defaultValue: false },
      edited: { type: DataTypes.BOOLEAN, defaultValue: false },
      editedAt: { type: DataTypes.DATE, allowNull: true },
      reactions: { type: DataTypes.JSON, defaultValue: [] },
    },
    { tableName: 'messages' }
  );

  const GroupSequelize = sequelize.define(
    'Group',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      name: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.STRING(500), defaultValue: '' },
      image: { type: DataTypes.STRING(500), defaultValue: '' },
      owner: { type: DataTypes.UUID, allowNull: false },
      chat: { type: DataTypes.UUID, allowNull: true },
    },
    { tableName: 'groups' }
  );

  const GroupMemberSequelize = sequelize.define(
    'GroupMember',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      group: { type: DataTypes.UUID, allowNull: false },
      user: { type: DataTypes.UUID, allowNull: false },
      role: { type: DataTypes.ENUM('owner', 'admin', 'member'), defaultValue: 'member' },
    },
    { tableName: 'group_members', indexes: [{ unique: true, fields: ['group', 'user'] }] }
  );

  const FriendshipSequelize = sequelize.define(
    'Friendship',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      users: { type: DataTypes.JSON, allowNull: false },
    },
    { tableName: 'friendships' }
  );

  const FriendRequestSequelize = sequelize.define(
    'FriendRequest',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      from: { type: DataTypes.UUID, allowNull: false },
      to: { type: DataTypes.UUID, allowNull: false },
      status: { type: DataTypes.ENUM('pending', 'accepted', 'rejected'), defaultValue: 'pending' },
    },
    { tableName: 'friend_requests', indexes: [{ unique: true, fields: ['from', 'to'] }] }
  );

  const BlockedUserSequelize = sequelize.define(
    'BlockedUser',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      blocker: { type: DataTypes.UUID, allowNull: false },
      blocked: { type: DataTypes.UUID, allowNull: false },
    },
    { tableName: 'blocked_users', indexes: [{ unique: true, fields: ['blocker', 'blocked'] }] }
  );

  const NotificationSequelize = sequelize.define(
    'Notification',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      recipient: { type: DataTypes.UUID, allowNull: false },
      sender: { type: DataTypes.UUID, allowNull: true },
      type: {
        type: DataTypes.ENUM(
          'friend_request',
          'friend_accepted',
          'new_message',
          'group_invite',
          'incoming_call',
          'missed_call',
          'system'
        ),
        allowNull: false,
      },
      title: { type: DataTypes.STRING(255), allowNull: false },
      body: { type: DataTypes.TEXT, defaultValue: '' },
      data: { type: DataTypes.JSON, defaultValue: {} },
      isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    { tableName: 'notifications' }
  );

  const CallSequelize = sequelize.define(
    'Call',
    {
      id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
      caller: { type: DataTypes.UUID, allowNull: false },
      receiver: { type: DataTypes.UUID, allowNull: false },
      participants: { type: DataTypes.JSON, defaultValue: [] },
      chat: { type: DataTypes.UUID, allowNull: true },
      type: { type: DataTypes.ENUM('audio', 'video'), allowNull: false },
      status: {
        type: DataTypes.ENUM('ringing', 'accepted', 'rejected', 'ended', 'missed'),
        defaultValue: 'ringing',
      },
      startedAt: { type: DataTypes.DATE, allowNull: true },
      endedAt: { type: DataTypes.DATE, allowNull: true },
      duration: { type: DataTypes.INTEGER, defaultValue: 0 },
    },
    { tableName: 'calls' }
  );

  // User instance methods
  UserSequelize.prototype.comparePassword = async function comparePassword(candidate) {
    return bcrypt.compare(candidate, this.password);
  };

  UserSequelize.prototype.toSafeObject = function toSafeObject() {
    return {
      id: this.id,
      _id: this.id,
      name: this.name,
      username: this.username,
      email: this.email,
      mobile: this.mobile,
      profilePicture: this.profilePicture,
      bio: this.bio,
      statusMessage: this.statusMessage,
      isOnline: this.isOnline,
      lastSeen: this.lastSeen,
      settings: this.settings || {},
      createdAt: this.createdAt,
    };
  };

  UserSequelize.beforeCreate(async (user) => {
    if (user.password) user.password = await bcrypt.hash(user.password, 12);
  });

  UserSequelize.beforeUpdate(async (user) => {
    if (user.changed('password')) user.password = await bcrypt.hash(user.password, 12);
  });

  CallSequelize.beforeCreate((call) => {
    if (!call.participants?.length) call.participants = [call.caller, call.receiver];
  });

  // Build compat models (forward refs resolved after all created)
  let User, Chat, Message, Group, GroupMember, Friendship, FriendRequest, BlockedUser, Notification, Call, OTP;

  User = createCompatModel(UserSequelize, { name: 'User' });

  Chat = createCompatModel(ChatSequelize, {
    name: 'Chat',
    jsonArrayFields: ['participants', 'pinnedBy', 'archivedBy'],
    jsonMapFields: ['unreadCounts'],
    populateConfig: {
      participants: { type: 'array', model: UserSequelize, compatModel: null },
      group: { type: 'ref', model: null, compatModel: null },
      lastMessage: { type: 'ref', model: MessageSequelize, compatModel: null },
    },
    hooks: {
      beforeCreate(payload) {
        if (payload.unreadCounts && !(payload.unreadCounts instanceof Map)) {
          // keep as object
        }
      },
      wrapInstance(doc) {
        const raw = doc.getDataValue('unreadCounts');
        if (raw && !(raw instanceof Map)) {
          const map = new Map(Object.entries(raw));
          doc.setDataValue('unreadCounts', map);
        }
      },
      beforeSave(row) {
        const uc = row.getDataValue('unreadCounts');
        if (uc instanceof Map) row.setDataValue('unreadCounts', Object.fromEntries(uc));
      },
    },
  });

  Message = createCompatModel(MessageSequelize, {
    name: 'Message',
    jsonArrayFields: ['deliveredTo', 'seenBy', 'deletedFor'],
    populateConfig: {
      sender: { type: 'ref', model: UserSequelize, compatModel: User },
      replyTo: { type: 'ref', model: MessageSequelize, compatModel: null },
      forwardedFrom: { type: 'ref', model: UserSequelize, compatModel: User },
      chat: { type: 'ref', model: ChatSequelize, compatModel: Chat },
    },
  });

  Group = createCompatModel(GroupSequelize, {
    name: 'Group',
    populateConfig: {
      owner: { type: 'ref', model: UserSequelize, compatModel: User },
    },
  });

  GroupMember = createCompatModel(GroupMemberSequelize, {
    name: 'GroupMember',
    populateConfig: {
      user: { type: 'ref', model: UserSequelize, compatModel: User },
    },
  });

  Friendship = createCompatModel(FriendshipSequelize, {
    name: 'Friendship',
    jsonArrayFields: ['users'],
    populateConfig: {
      users: { type: 'array', model: UserSequelize, compatModel: User },
    },
  });

  FriendRequest = createCompatModel(FriendRequestSequelize, {
    name: 'FriendRequest',
    populateConfig: {
      from: { type: 'ref', model: UserSequelize, compatModel: User },
      to: { type: 'ref', model: UserSequelize, compatModel: User },
    },
  });

  BlockedUser = createCompatModel(BlockedUserSequelize, {
    name: 'BlockedUser',
    populateConfig: {
      blocked: { type: 'ref', model: UserSequelize, compatModel: User },
    },
  });

  Notification = createCompatModel(NotificationSequelize, {
    name: 'Notification',
    populateConfig: {
      sender: { type: 'ref', model: UserSequelize, compatModel: User },
    },
  });

  Call = createCompatModel(CallSequelize, {
    name: 'Call',
    jsonArrayFields: ['participants'],
    populateConfig: {
      caller: { type: 'ref', model: UserSequelize, compatModel: User },
      receiver: { type: 'ref', model: UserSequelize, compatModel: User },
      participants: { type: 'array', model: UserSequelize, compatModel: User },
    },
  });

  OTP = createCompatModel(OTPSequelize, { name: 'OTP' });

  // Fix forward refs
  Chat._populateConfig.participants.compatModel = User;
  Chat._populateConfig.group.model = GroupSequelize;
  Chat._populateConfig.group.compatModel = Group;
  Chat._populateConfig.lastMessage.model = MessageSequelize;
  Chat._populateConfig.lastMessage.compatModel = Message;
  Message._populateConfig.replyTo.compatModel = Message;

  // Add save() to wrapped instances via prototype patch
  const addSave = (SequelizeModel, CompatModel, beforeSave) => {
    const origWrap = CompatModel._wrapInstance?.bind(CompatModel);
    CompatModel._wrapInstance = (doc) => {
      if (origWrap) origWrap(doc);
      doc.save = async function save() {
        const plain = this.get({ plain: true });
        if (beforeSave) beforeSave(this);
        // sync json map fields
        if (CompatModel._jsonMapFields) {
          for (const f of CompatModel._jsonMapFields) {
            const v = this.getDataValue(f);
            if (v instanceof Map) plain[f] = Object.fromEntries(v);
          }
        }
        await SequelizeModel.update(plain, { where: { id: plain.id } });
        return wrapDoc(await SequelizeModel.findByPk(plain.id), CompatModel);
      };
      doc.populate = async function populate(path, select) {
        await CompatModel._applyPopulate(this, { path, select });
        return this;
      };
    };
  };

  addSave(UserSequelize, User);
  addSave(ChatSequelize, Chat, (doc) => {
    const uc = doc.getDataValue('unreadCounts');
    if (uc instanceof Map) doc.setDataValue('unreadCounts', Object.fromEntries(uc));
  });
  addSave(MessageSequelize, Message);
  addSave(GroupSequelize, Group);
  addSave(GroupMemberSequelize, GroupMember);
  addSave(FriendRequestSequelize, FriendRequest);
  addSave(CallSequelize, Call);

  // User findOne with +password
  const origUserFindOne = User.findOne.bind(User);
  User.findOne = (filter) => {
    const qb = origUserFindOne(filter);
    const origSelect = qb.select.bind(qb);
    qb.select = (s) => {
      origSelect(s);
      qb._includePassword = s?.startsWith?.('+');
      return qb;
    };
    const origRun = qb._run.bind(qb);
    qb._run = async function () {
      if (this._includePassword) this._select = null;
      return origRun();
    };
    return qb;
  };

  const origUserFindById = User.findById.bind(User);
  User.findById = (id) => {
    const qb = origUserFindById(id);
    const origSelect = qb.select.bind(qb);
    qb.select = (s) => {
      origSelect(s);
      qb._includePassword = s?.startsWith?.('+');
      return qb;
    };
    const origRun = qb._run.bind(qb);
    qb._run = async function () {
      if (this._includePassword) this._select = null;
      return origRun();
    };
    return qb;
  };

  // Notification lean() support
  const origNotifFindById = Notification.findById.bind(Notification);
  Notification.findById = (id) => {
    const qb = origNotifFindById(id);
    qb.lean = () => qb;
    return qb;
  };

  return {
    sequelize,
    User,
    OTP,
    Chat,
    Message,
    Group,
    GroupMember,
    Friendship,
    FriendRequest,
    BlockedUser,
    Notification,
    Call,
  };
};

export default initModels;
