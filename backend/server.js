const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const dayjs = require('dayjs');
const { db, initDatabase } = require('./database');
const { generateToken, authMiddleware, adminMiddleware } = require('./middleware/auth');

const app = express();
const PORT = 8129;

app.use(cors());
app.use(express.json());

initDatabase();

const STATUS_FLOW = {
  待挂牌: ['已挂装'],
  已挂装: ['待调换', '待回收确认', '异常观察'],
  待调换: ['已挂装', '异常观察'],
  待回收确认: ['已回收', '异常观察'],
  已回收: ['待挂牌'],
  异常观察: ['已挂装', '待回收确认', '已回收']
};

function generateRecordNo(prefix) {
  return `${prefix}${dayjs().format('YYYYMMDDHHmmss')}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}

function logOperation(userId, action, targetType, targetId, detail) {
  try {
    db.prepare('INSERT INTO operation_logs (user_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)')
      .run(userId || null, action, targetType || null, targetId || null, detail || null);
  } catch (e) { /* ignore */ }
}

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码不能为空' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ message: '用户不存在' });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ message: '密码错误' });
  }
  const token = generateToken(user);
  logOperation(user.id, '登录', 'user', user.id, `${user.real_name}登录系统`);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      realName: user.real_name,
      role: user.role
    }
  });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/users', authMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, username, real_name, role, created_at FROM users').all();
  res.json({ data: users });
});

app.get('/api/tag-templates', authMiddleware, (req, res) => {
  const tpls = db.prepare('SELECT * FROM tag_templates ORDER BY id DESC').all();
  res.json({ data: tpls });
});

app.post('/api/tag-templates', authMiddleware, adminMiddleware, (req, res) => {
  const { templateCode, templateName, description, fields } = req.body;
  if (!templateCode || !templateName) {
    return res.status(400).json({ message: '模板编码和名称必填' });
  }
  const exists = db.prepare('SELECT id FROM tag_templates WHERE template_code = ?').get(templateCode);
  if (exists) return res.status(400).json({ message: '模板编码已存在' });
  const info = db.prepare('INSERT INTO tag_templates (template_code, template_name, description, fields) VALUES (?, ?, ?, ?)')
    .run(templateCode, templateName, description || '', fields || '{}');
  logOperation(req.user.id, '创建挂牌模板', 'tag_template', info.lastInsertRowid, JSON.stringify(req.body));
  res.json({ data: { id: info.lastInsertRowid }, message: '创建成功' });
});

app.get('/api/tags', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 20, keyword, status, templateId } = req.query;
  let sql = `SELECT t.*, tt.template_name, 
             (SELECT COUNT(*) FROM hanging_records h WHERE h.tag_id = t.id) as hang_count
             FROM tags t 
             LEFT JOIN tag_templates tt ON t.template_id = tt.id WHERE 1=1`;
  const params = [];
  if (keyword) { sql += ' AND (t.tag_code LIKE ? OR t.rfid_code LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
  if (status) { sql += ' AND t.status = ?'; params.push(status); }
  if (templateId) { sql += ' AND t.template_id = ?'; params.push(templateId); }
  sql += ' ORDER BY t.id DESC';
  const total = db.prepare(`SELECT COUNT(*) as c FROM (${sql})`).get(...params).c;
  const offset = (page - 1) * pageSize;
  const data = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, Number(pageSize), offset);
  res.json({ data, total, page: Number(page), pageSize: Number(pageSize) });
});

app.post('/api/tags', authMiddleware, (req, res) => {
  const { tagCode, templateId, rfidCode } = req.body;
  if (!tagCode) return res.status(400).json({ message: '挂牌编码必填' });
  const exists = db.prepare('SELECT id FROM tags WHERE tag_code = ?').get(tagCode);
  if (exists) return res.status(400).json({ message: '挂牌编码已存在' });
  const info = db.prepare('INSERT INTO tags (tag_code, template_id, rfid_code, status) VALUES (?, ?, ?, ?)')
    .run(tagCode, templateId || null, rfidCode || '', '待挂牌');
  logOperation(req.user.id, '创建挂牌', 'tag', info.lastInsertRowid, tagCode);
  res.json({ data: { id: info.lastInsertRowid }, message: '创建成功' });
});

app.get('/api/categories', authMiddleware, (req, res) => {
  const data = db.prepare('SELECT * FROM categories ORDER BY sort_order ASC, id ASC').all();
  res.json({ data });
});

app.post('/api/categories', authMiddleware, adminMiddleware, (req, res) => {
  const { categoryCode, categoryName, parentId, sortOrder } = req.body;
  if (!categoryCode || !categoryName) return res.status(400).json({ message: '编码和名称必填' });
  const exists = db.prepare('SELECT id FROM categories WHERE category_code = ?').get(categoryCode);
  if (exists) return res.status(400).json({ message: '分类编码已存在' });
  const info = db.prepare('INSERT INTO categories (category_code, category_name, parent_id, sort_order) VALUES (?, ?, ?, ?)')
    .run(categoryCode, categoryName, parentId || 0, sortOrder || 0);
  logOperation(req.user.id, '创建分类', 'category', info.lastInsertRowid, categoryName);
  res.json({ data: { id: info.lastInsertRowid }, message: '创建成功' });
});

app.get('/api/garments', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 20, keyword, categoryId, season } = req.query;
  let sql = `SELECT g.*, c.category_name FROM garments g 
             LEFT JOIN categories c ON g.category_id = c.id WHERE 1=1`;
  const params = [];
  if (keyword) { sql += ' AND (g.garment_code LIKE ? OR g.garment_name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`); }
  if (categoryId) { sql += ' AND g.category_id = ?'; params.push(categoryId); }
  if (season) { sql += ' AND g.season = ?'; params.push(season); }
  sql += ' ORDER BY g.id DESC';
  const total = db.prepare(`SELECT COUNT(*) as c FROM (${sql})`).get(...params).c;
  const offset = (page - 1) * pageSize;
  const data = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, Number(pageSize), offset);
  res.json({ data, total, page: Number(page), pageSize: Number(pageSize) });
});

app.get('/api/garments/:id', authMiddleware, (req, res) => {
  const garment = db.prepare(`SELECT g.*, c.category_name FROM garments g 
    LEFT JOIN categories c ON g.category_id = c.id WHERE g.id = ?`).get(req.params.id);
  if (!garment) return res.status(404).json({ message: '样衣不存在' });
  res.json({ data: garment });
});

app.post('/api/garments', authMiddleware, (req, res) => {
  const { garmentCode, garmentName, categoryId, season, color, size, fabric, description } = req.body;
  if (!garmentCode || !garmentName || !categoryId) return res.status(400).json({ message: '必填项缺失' });
  const exists = db.prepare('SELECT id FROM garments WHERE garment_code = ?').get(garmentCode);
  if (exists) return res.status(400).json({ message: '样衣编码已存在' });
  const info = db.prepare(`INSERT INTO garments 
    (garment_code, garment_name, category_id, season, color, size, fabric, description) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(garmentCode, garmentName, categoryId, season || '', color || '', size || '', fabric || '', description || '');
  logOperation(req.user.id, '创建样衣', 'garment', info.lastInsertRowid, garmentName);
  res.json({ data: { id: info.lastInsertRowid }, message: '创建成功' });
});

app.put('/api/garments/:id', authMiddleware, (req, res) => {
  const { garmentName, categoryId, season, color, size, fabric, description } = req.body;
  const garment = db.prepare('SELECT id FROM garments WHERE id = ?').get(req.params.id);
  if (!garment) return res.status(404).json({ message: '样衣不存在' });
  db.prepare(`UPDATE garments SET garment_name=?, category_id=?, season=?, color=?, size=?, fabric=?, description=? WHERE id=?`)
    .run(garmentName, categoryId, season || '', color || '', size || '', fabric || '', description || '', req.params.id);
  logOperation(req.user.id, '更新样衣', 'garment', req.params.id, garmentName);
  res.json({ message: '更新成功' });
});

app.get('/api/areas', authMiddleware, (req, res) => {
  const areas = db.prepare('SELECT * FROM display_areas ORDER BY floor, area_code').all();
  res.json({ data: areas });
});

app.post('/api/areas', authMiddleware, adminMiddleware, (req, res) => {
  const { areaCode, areaName, floor, zone, capacity } = req.body;
  if (!areaCode || !areaName) return res.status(400).json({ message: '必填项缺失' });
  const exists = db.prepare('SELECT id FROM display_areas WHERE area_code = ?').get(areaCode);
  if (exists) return res.status(400).json({ message: '区域编码已存在' });
  const info = db.prepare('INSERT INTO display_areas (area_code, area_name, floor, zone, capacity) VALUES (?, ?, ?, ?, ?)')
    .run(areaCode, areaName, floor || 1, zone || '', capacity || 10);
  res.json({ data: { id: info.lastInsertRowid }, message: '创建成功' });
});

app.get('/api/responsible-persons', authMiddleware, (req, res) => {
  const data = db.prepare('SELECT * FROM responsible_persons ORDER BY id DESC').all();
  res.json({ data });
});

app.post('/api/responsible-persons', authMiddleware, adminMiddleware, (req, res) => {
  const { personCode, personName, department, phone, email } = req.body;
  if (!personCode || !personName) return res.status(400).json({ message: '必填项缺失' });
  const exists = db.prepare('SELECT id FROM responsible_persons WHERE person_code = ?').get(personCode);
  if (exists) return res.status(400).json({ message: '编码已存在' });
  const info = db.prepare('INSERT INTO responsible_persons (person_code, person_name, department, phone, email) VALUES (?, ?, ?, ?, ?)')
    .run(personCode, personName, department || '', phone || '', email || '');
  res.json({ data: { id: info.lastInsertRowid }, message: '创建成功' });
});

app.get('/api/hanging/available-tags', authMiddleware, (req, res) => {
  const tags = db.prepare(`SELECT t.*, tt.template_name FROM tags t 
    LEFT JOIN tag_templates tt ON t.template_id = tt.id 
    WHERE t.status = '待挂牌' ORDER BY t.tag_code`).all();
  res.json({ data: tags });
});

app.get('/api/hanging/available-garments', authMiddleware, (req, res) => {
  const sql = `SELECT g.*, c.category_name FROM garments g 
    LEFT JOIN categories c ON g.category_id = c.id
    WHERE g.id NOT IN (SELECT garment_id FROM hanging_records WHERE status IN ('已挂装','待调换','待回收确认'))
    ORDER BY g.id DESC`;
  const data = db.prepare(sql).all();
  res.json({ data });
});

function checkPositionConflict(areaId, layerNo, positionNo, excludeHangId = null) {
  let sql = `SELECT h.*, g.garment_name, t.tag_code, da.area_name 
    FROM hanging_records h 
    LEFT JOIN garments g ON h.garment_id = g.id
    LEFT JOIN tags t ON h.tag_id = t.id
    LEFT JOIN display_areas da ON h.area_id = da.id
    WHERE h.area_id = ? AND h.layer_no = ? AND h.position_no = ? 
    AND h.status IN ('已挂装','待调换')`;
  const params = [areaId, layerNo, positionNo];
  if (excludeHangId) { sql += ' AND h.id != ?'; params.push(excludeHangId); }
  return db.prepare(sql).get(...params);
}

function checkTagAlreadyHanged(tagId, excludeHangId = null) {
  let sql = `SELECT h.*, g.garment_name FROM hanging_records h 
    LEFT JOIN garments g ON h.garment_id = g.id
    WHERE h.tag_id = ? AND h.status IN ('已挂装','待调换','待回收确认')`;
  const params = [tagId];
  if (excludeHangId) { sql += ' AND h.id != ?'; params.push(excludeHangId); }
  return db.prepare(sql).get(...params);
}

function checkGarmentAlreadyHanged(garmentId, excludeHangId = null) {
  let sql = `SELECT h.*, t.tag_code FROM hanging_records h 
    LEFT JOIN tags t ON h.tag_id = t.id
    WHERE h.garment_id = ? AND h.status IN ('已挂装','待调换','待回收确认')`;
  const params = [garmentId];
  if (excludeHangId) { sql += ' AND h.id != ?'; params.push(excludeHangId); }
  return db.prepare(sql).get(...params);
}

function checkUnresolvedMissingPart(tagId, garmentId) {
  const sql = `SELECT * FROM missing_part_notes 
    WHERE status != '已处理' 
    AND (tag_id = ? OR garment_id = ?)`;
  return db.prepare(sql).all(tagId, garmentId);
}

function updateTagStatus(tagId, status) {
  if (!STATUS_FLOW || true) {
    db.prepare('UPDATE tags SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, tagId);
  }
}

app.post('/api/hanging', authMiddleware, (req, res) => {
  const { tagId, garmentId, areaId, layerNo, positionNo, responsibleId, remark } = req.body;
  if (!tagId || !garmentId || !areaId || !layerNo || !positionNo || !responsibleId) {
    return res.status(400).json({ message: '必填项缺失' });
  }

  const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId);
  if (!tag) return res.status(404).json({ message: '挂牌不存在' });

  if (tag.status === '异常观察') {
    const pendingMissing = checkUnresolvedMissingPart(tagId, garmentId);
    if (pendingMissing.length > 0) {
      return res.status(400).json({ message: `该挂牌存在${pendingMissing.length}条未处理的缺件说明，处理完成前不可挂装` });
    }
  }

  if (tag.status !== '待挂牌' && tag.status !== '异常观察') {
    return res.status(400).json({ message: `挂牌当前状态为"${tag.status}"，不可挂装` });
  }

  const tagHanged = checkTagAlreadyHanged(tagId);
  if (tagHanged) return res.status(400).json({ message: `该挂牌已挂在样衣[${tagHanged.garment_name}]上，不能同时挂在两件样衣` });

  const garmentHanged = checkGarmentAlreadyHanged(garmentId);
  if (garmentHanged) return res.status(400).json({ message: `该样衣已被挂牌[${garmentHanged.tag_code}]挂装` });

  const conflict = checkPositionConflict(areaId, layerNo, positionNo);
  if (conflict) {
    return res.status(400).json({
      message: `区域[${conflict.area_name}]第${layerNo}层第${positionNo}位已被样衣[${conflict.garment_name}]占用`
    });
  }

  const recordNo = generateRecordNo('HANG');
  const tx = db.transaction(() => {
    const hangInfo = db.prepare(`INSERT INTO hanging_records 
      (record_no, tag_id, garment_id, area_id, layer_no, position_no, responsible_id, operator_id, status, remark) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '已挂装', ?)`)
      .run(recordNo, tagId, garmentId, areaId, layerNo, positionNo, responsibleId, req.user.id, remark || '');
    updateTagStatus(tagId, '已挂装');
    return hangInfo;
  });
  const result = tx();
  logOperation(req.user.id, '挂装', 'hanging_record', result.lastInsertRowid, `挂牌#${tag.tag_code} -> 样衣`);
  res.json({ data: { id: result.lastInsertRowid, recordNo }, message: '挂装成功' });
});

app.get('/api/hanging-records', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 20, categoryId, areaId, responsibleId, status, startDate, endDate, hasMissing, keyword } = req.query;
  let sql = `SELECT h.*, 
    t.tag_code, t.rfid_code, tt.template_name,
    g.garment_code, g.garment_name, g.season, g.color, c.category_name,
    da.area_name, da.area_code, da.floor,
    rp.person_name, rp.person_code, rp.department,
    u.real_name as operator_name,
    (SELECT COUNT(*) FROM missing_part_notes m WHERE m.hang_id = h.id AND m.status != '已处理') as unresolved_missing_count,
    (SELECT COUNT(*) FROM swap_records s WHERE s.original_hang_id = h.id) as swap_count
    FROM hanging_records h
    LEFT JOIN tags t ON h.tag_id = t.id
    LEFT JOIN tag_templates tt ON t.template_id = tt.id
    LEFT JOIN garments g ON h.garment_id = g.id
    LEFT JOIN categories c ON g.category_id = c.id
    LEFT JOIN display_areas da ON h.area_id = da.id
    LEFT JOIN responsible_persons rp ON h.responsible_id = rp.id
    LEFT JOIN users u ON h.operator_id = u.id
    WHERE 1=1`;
  const params = [];
  if (keyword) {
    sql += ' AND (t.tag_code LIKE ? OR g.garment_code LIKE ? OR g.garment_name LIKE ? OR h.record_no LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (categoryId) { sql += ' AND g.category_id = ?'; params.push(categoryId); }
  if (areaId) { sql += ' AND h.area_id = ?'; params.push(areaId); }
  if (responsibleId) { sql += ' AND h.responsible_id = ?'; params.push(responsibleId); }
  if (status) { sql += ' AND h.status = ?'; params.push(status); }
  if (startDate) { sql += ' AND h.hang_time >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND h.hang_time <= ?'; params.push(endDate + ' 23:59:59'); }
  if (hasMissing === 'true') {
    sql += ' AND EXISTS (SELECT 1 FROM missing_part_notes m WHERE m.hang_id = h.id AND m.status != \'已处理\')';
  } else if (hasMissing === 'false') {
    sql += ' AND NOT EXISTS (SELECT 1 FROM missing_part_notes m WHERE m.hang_id = h.id AND m.status != \'已处理\')';
  }
  sql += ' ORDER BY h.id DESC';
  const total = db.prepare(`SELECT COUNT(*) as c FROM (${sql})`).get(...params).c;
  const offset = (page - 1) * pageSize;
  const data = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, Number(pageSize), offset);
  res.json({ data, total, page: Number(page), pageSize: Number(pageSize) });
});

app.get('/api/hanging-records/:id', authMiddleware, (req, res) => {
  const hang = db.prepare(`SELECT h.*, 
    t.tag_code, t.rfid_code, t.status as tag_status, tt.template_name, tt.fields,
    g.garment_code, g.garment_name, g.season, g.color, g.size, g.fabric, g.description, c.category_name,
    da.area_name, da.area_code, da.floor,
    rp.person_name, rp.person_code, rp.department, rp.phone, rp.email,
    u.real_name as operator_name
    FROM hanging_records h
    LEFT JOIN tags t ON h.tag_id = t.id
    LEFT JOIN tag_templates tt ON t.template_id = tt.id
    LEFT JOIN garments g ON h.garment_id = g.id
    LEFT JOIN categories c ON g.category_id = c.id
    LEFT JOIN display_areas da ON h.area_id = da.id
    LEFT JOIN responsible_persons rp ON h.responsible_id = rp.id
    LEFT JOIN users u ON h.operator_id = u.id
    WHERE h.id = ?`).get(req.params.id);
  if (!hang) return res.status(404).json({ message: '记录不存在' });

  const swaps = db.prepare(`SELECT s.*, 
    og.garment_name as original_garment_name, ng.garment_name as new_garment_name,
    oda.area_name as original_area, nda.area_name as new_area,
    u.real_name as operator_name
    FROM swap_records s
    LEFT JOIN hanging_records oh ON s.original_hang_id = oh.id
    LEFT JOIN garments og ON oh.garment_id = og.id
    LEFT JOIN garments ng ON s.new_garment_id = ng.id
    LEFT JOIN display_areas oda ON oh.area_id = oda.id
    LEFT JOIN display_areas nda ON s.new_area_id = nda.id
    LEFT JOIN users u ON s.operator_id = u.id
    WHERE s.original_hang_id = ? ORDER BY s.swap_time DESC`).all(req.params.id);

  const missingParts = db.prepare(`SELECT m.*, 
    u1.real_name as reporter_name, u2.real_name as handler_name
    FROM missing_part_notes m
    LEFT JOIN users u1 ON m.reporter_id = u1.id
    LEFT JOIN users u2 ON m.handler_id = u2.id
    WHERE m.hang_id = ? ORDER BY m.report_time DESC`).all(req.params.id);

  res.json({ data: { ...hang, swaps, missingParts } });
});

app.post('/api/swap', authMiddleware, (req, res) => {
  const { originalHangId, newGarmentId, newAreaId, newLayerNo, newPositionNo, swapReason } = req.body;
  if (!originalHangId || !newGarmentId) return res.status(400).json({ message: '必填项缺失' });

  const originalHang = db.prepare('SELECT * FROM hanging_records WHERE id = ?').get(originalHangId);
  if (!originalHang) return res.status(404).json({ message: '原挂装记录不存在' });
  if (!['已挂装', '待调换'].includes(originalHang.status)) {
    return res.status(400).json({ message: `当前状态"${originalHang.status}"不允许调换` });
  }

  const pendingMissing = checkUnresolvedMissingPart(originalHang.tag_id, newGarmentId);
  if (pendingMissing.length > 0) {
    return res.status(400).json({ message: `存在${pendingMissing.length}条未处理的缺件说明，处理完成前不可调换` });
  }

  const newGarment = db.prepare('SELECT * FROM garments WHERE id = ?').get(newGarmentId);
  if (!newGarment) return res.status(404).json({ message: '新样衣不存在' });

  const garmentHanged = checkGarmentAlreadyHanged(newGarmentId, originalHangId);
  if (garmentHanged) return res.status(400).json({ message: `新样衣已被挂牌[${garmentHanged.tag_code}]挂装` });

  let finalAreaId = newAreaId || originalHang.area_id;
  let finalLayerNo = newLayerNo || originalHang.layer_no;
  let finalPositionNo = newPositionNo || originalHang.position_no;

  if (newAreaId || newLayerNo || newPositionNo) {
    const conflict = checkPositionConflict(finalAreaId, finalLayerNo, finalPositionNo, originalHangId);
    if (conflict) {
      return res.status(400).json({
        message: `区域[${conflict.area_name}]第${finalLayerNo}层第${finalPositionNo}位已被样衣[${conflict.garment_name}]占用`
      });
    }
  }

  const recentSwaps = db.prepare(`SELECT COUNT(*) as c FROM swap_records s 
    WHERE s.original_hang_id = ? AND s.swap_time >= datetime('now', '-7 day')`).get(originalHangId).c;
  const frequentWarning = recentSwaps >= 3 ? `警告：该挂牌近7天已调换${recentSwaps}次，调换过频` : null;

  const recordNo = generateRecordNo('SWP');
  const tx = db.transaction(() => {
    const swapInfo = db.prepare(`INSERT INTO swap_records 
      (record_no, original_hang_id, new_garment_id, new_area_id, new_layer_no, new_position_no, swap_reason, operator_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(recordNo, originalHangId, newGarmentId, newAreaId || null, newLayerNo || null, newPositionNo || null, swapReason || '', req.user.id);

    db.prepare(`UPDATE hanging_records SET 
      garment_id = ?, area_id = ?, layer_no = ?, position_no = ?, status = '已挂装' 
      WHERE id = ?`)
      .run(newGarmentId, finalAreaId, finalLayerNo, finalPositionNo, originalHangId);
    return swapInfo;
  });
  tx();
  logOperation(req.user.id, '调换', 'swap_record', null, `挂装记录#${originalHangId}`);
  res.json({ data: { recordNo, frequentWarning }, message: frequentWarning || '调换成功' });
});

app.post('/api/recovery/request', authMiddleware, (req, res) => {
  const { hangId, remark } = req.body;
  if (!hangId) return res.status(400).json({ message: '挂装记录ID必填' });
  const hang = db.prepare('SELECT * FROM hanging_records WHERE id = ?').get(hangId);
  if (!hang) return res.status(404).json({ message: '挂装记录不存在' });
  if (!['已挂装', '待调换', '异常观察'].includes(hang.status)) {
    return res.status(400).json({ message: `当前状态"${hang.status}"不允许申请回收` });
  }

  const pendingRecovery = db.prepare(`SELECT * FROM recovery_records 
    WHERE hang_id = ? AND status = '待回收确认'`).get(hangId);
  if (pendingRecovery) return res.status(400).json({ message: '该挂装已存在待确认的回收申请' });

  const recordNo = generateRecordNo('RCV');
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO recovery_records 
      (record_no, hang_id, tag_id, garment_id, recover_operator_id, recover_time, status, remark) 
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, '待回收确认', ?)`)
      .run(recordNo, hangId, hang.tag_id, hang.garment_id, req.user.id, remark || '');
    db.prepare('UPDATE hanging_records SET status = ? WHERE id = ?').run('待回收确认', hangId);
    updateTagStatus(hang.tag_id, '待回收确认');
  });
  tx();
  logOperation(req.user.id, '申请回收', 'recovery_record', null, recordNo);
  res.json({ message: '回收申请已提交', data: { recordNo } });
});

app.get('/api/recovery-records', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 20, status, startDate, endDate, keyword } = req.query;
  let sql = `SELECT r.*, 
    h.record_no as hang_record_no, h.layer_no, h.position_no,
    t.tag_code, g.garment_code, g.garment_name, c.category_name,
    da.area_name, u1.real_name as recover_op_name, u2.real_name as confirm_op_name
    FROM recovery_records r
    LEFT JOIN hanging_records h ON r.hang_id = h.id
    LEFT JOIN tags t ON r.tag_id = t.id
    LEFT JOIN garments g ON r.garment_id = g.id
    LEFT JOIN categories c ON g.category_id = c.id
    LEFT JOIN display_areas da ON h.area_id = da.id
    LEFT JOIN users u1 ON r.recover_operator_id = u1.id
    LEFT JOIN users u2 ON r.confirm_operator_id = u2.id
    WHERE 1=1`;
  const params = [];
  if (keyword) {
    sql += ' AND (t.tag_code LIKE ? OR g.garment_code LIKE ? OR r.record_no LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (status) { sql += ' AND r.status = ?'; params.push(status); }
  if (startDate) { sql += ' AND r.recover_time >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND r.recover_time <= ?'; params.push(endDate + ' 23:59:59'); }
  sql += ' ORDER BY r.id DESC';
  const total = db.prepare(`SELECT COUNT(*) as c FROM (${sql})`).get(...params).c;
  const offset = (page - 1) * pageSize;
  const data = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, Number(pageSize), offset);
  res.json({ data, total, page: Number(page), pageSize: Number(pageSize) });
});

app.post('/api/recovery/confirm', authMiddleware, (req, res) => {
  const { recoveryId, confirmRemark } = req.body;
  if (!recoveryId) return res.status(400).json({ message: '回收记录ID必填' });
  const recovery = db.prepare('SELECT * FROM recovery_records WHERE id = ?').get(recoveryId);
  if (!recovery) return res.status(404).json({ message: '回收记录不存在' });
  if (recovery.status !== '待回收确认') {
    return res.status(400).json({ message: `当前状态"${recovery.status}"不可确认` });
  }

  const tx = db.transaction(() => {
    db.prepare(`UPDATE recovery_records SET 
      status = '已回收', confirm_operator_id = ?, confirm_time = CURRENT_TIMESTAMP, 
      remark = COALESCE(NULLIF(remark, ''), '') || COALESCE(?,'')
      WHERE id = ?`).run(req.user.id, confirmRemark ? `【复核】${confirmRemark}` : '', recoveryId);
    db.prepare('UPDATE hanging_records SET status = ? WHERE id = ?').run('已回收', recovery.hang_id);
    updateTagStatus(recovery.tag_id, '已回收');
  });
  tx();
  logOperation(req.user.id, '确认回收', 'recovery_record', recoveryId, recovery.record_no);
  res.json({ message: '回收确认完成' });
});

app.post('/api/recovery/reject', authMiddleware, (req, res) => {
  const { recoveryId, rejectReason } = req.body;
  if (!recoveryId || !rejectReason) return res.status(400).json({ message: '必填项缺失' });
  const recovery = db.prepare('SELECT * FROM recovery_records WHERE id = ?').get(recoveryId);
  if (!recovery) return res.status(404).json({ message: '回收记录不存在' });
  if (recovery.status !== '待回收确认') return res.status(400).json({ message: '当前状态不可驳回' });

  const tx = db.transaction(() => {
    db.prepare(`UPDATE recovery_records SET status = '已驳回', confirm_operator_id = ?, confirm_time = CURRENT_TIMESTAMP, remark = ? WHERE id = ?`)
      .run(req.user.id, `【驳回】${rejectReason}`, recoveryId);
    db.prepare('UPDATE hanging_records SET status = ? WHERE id = ?').run('已挂装', recovery.hang_id);
    updateTagStatus(recovery.tag_id, '已挂装');
  });
  tx();
  res.json({ message: '已驳回回收申请' });
});

app.post('/api/missing-part', authMiddleware, (req, res) => {
  const { hangId, tagId, garmentId, missingType, missingDescription } = req.body;
  if (!missingType || !missingDescription) return res.status(400).json({ message: '缺件类型和描述必填' });
  const recordNo = generateRecordNo('MIS');
  const info = db.prepare(`INSERT INTO missing_part_notes 
    (record_no, hang_id, tag_id, garment_id, missing_type, missing_description, reporter_id, status) 
    VALUES (?, ?, ?, ?, ?, ?, ?, '未处理')`)
    .run(recordNo, hangId || null, tagId || null, garmentId || null, missingType, missingDescription, req.user.id);

  if (tagId) updateTagStatus(tagId, '异常观察');
  logOperation(req.user.id, '上报缺件', 'missing_part', info.lastInsertRowid, missingType);
  res.json({ data: { id: info.lastInsertRowid, recordNo }, message: '缺件说明已记录' });
});

app.get('/api/missing-parts', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 20, status, missingType, startDate, endDate, keyword } = req.query;
  let sql = `SELECT m.*, 
    t.tag_code, g.garment_code, g.garment_name, h.record_no as hang_record_no,
    u1.real_name as reporter_name, u2.real_name as handler_name
    FROM missing_part_notes m
    LEFT JOIN tags t ON m.tag_id = t.id
    LEFT JOIN garments g ON m.garment_id = g.id
    LEFT JOIN hanging_records h ON m.hang_id = h.id
    LEFT JOIN users u1 ON m.reporter_id = u1.id
    LEFT JOIN users u2 ON m.handler_id = u2.id
    WHERE 1=1`;
  const params = [];
  if (keyword) {
    sql += ' AND (m.record_no LIKE ? OR t.tag_code LIKE ? OR g.garment_code LIKE ? OR m.missing_description LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (status) { sql += ' AND m.status = ?'; params.push(status); }
  if (missingType) { sql += ' AND m.missing_type = ?'; params.push(missingType); }
  if (startDate) { sql += ' AND m.report_time >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND m.report_time <= ?'; params.push(endDate + ' 23:59:59'); }
  sql += ' ORDER BY m.id DESC';
  const total = db.prepare(`SELECT COUNT(*) as c FROM (${sql})`).get(...params).c;
  const offset = (page - 1) * pageSize;
  const data = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, Number(pageSize), offset);
  res.json({ data, total, page: Number(page), pageSize: Number(pageSize) });
});

app.post('/api/missing-part/:id/handle', authMiddleware, (req, res) => {
  const { handleResult } = req.body;
  const missing = db.prepare('SELECT * FROM missing_part_notes WHERE id = ?').get(req.params.id);
  if (!missing) return res.status(404).json({ message: '记录不存在' });
  if (missing.status === '已处理') return res.status(400).json({ message: '该缺件已处理' });

  const tx = db.transaction(() => {
    db.prepare(`UPDATE missing_part_notes SET 
      status = '已处理', handler_id = ?, handle_time = CURRENT_TIMESTAMP, handle_result = ? 
      WHERE id = ?`).run(req.user.id, handleResult || '', req.params.id);

    if (missing.tag_id) {
      const remainUnresolved = db.prepare(`SELECT COUNT(*) as c FROM missing_part_notes 
        WHERE tag_id = ? AND status != '已处理' AND id != ?`).get(missing.tag_id, req.params.id).c;
      if (remainUnresolved === 0) {
        const tag = db.prepare('SELECT status FROM tags WHERE id = ?').get(missing.tag_id);
        if (tag && tag.status === '异常观察') {
          updateTagStatus(missing.tag_id, '待挂牌');
        }
      }
    }
  });
  tx();
  logOperation(req.user.id, '处理缺件', 'missing_part', req.params.id, missing.record_no);
  res.json({ message: '缺件处理完成' });
});

app.get('/api/statistics/overview', authMiddleware, (req, res) => {
  const totalTags = db.prepare('SELECT COUNT(*) as c FROM tags').get().c;
  const totalGarments = db.prepare('SELECT COUNT(*) as c FROM garments').get().c;
  const totalHanging = db.prepare('SELECT COUNT(*) as c FROM hanging_records WHERE status IN (\'已挂装\',\'待调换\')').get().c;
  const pendingRecovery = db.prepare('SELECT COUNT(*) as c FROM recovery_records WHERE status = \'待回收确认\'').get().c;
  const unhandledMissing = db.prepare('SELECT COUNT(*) as c FROM missing_part_notes WHERE status != \'已处理\'').get().c;

  const statusDistribution = db.prepare(`SELECT status, COUNT(*) as count FROM tags GROUP BY status`).all();

  const categoryDistribution = db.prepare(`SELECT c.id, c.category_name, COUNT(g.id) as count
    FROM categories c LEFT JOIN garments g ON c.parent_id = 0 AND g.category_id = c.id
    WHERE c.parent_id = 0 GROUP BY c.id ORDER BY count DESC`).all();

  const areaOccupancy = db.prepare(`SELECT da.id, da.area_code, da.area_name, da.floor, da.capacity,
    COUNT(h.id) as used_count
    FROM display_areas da
    LEFT JOIN hanging_records h ON da.id = h.area_id AND h.status IN ('已挂装','待调换')
    GROUP BY da.id ORDER BY da.floor, da.area_code`).all();

  const missingTypeStats = db.prepare(`SELECT missing_type, COUNT(*) as count 
    FROM missing_part_notes GROUP BY missing_type ORDER BY count DESC`).all();

  const pendingConfirmList = db.prepare(`SELECT r.id, r.record_no, r.recover_time, 
    t.tag_code, g.garment_name, da.area_name, u.real_name as applicant_name
    FROM recovery_records r
    LEFT JOIN tags t ON r.tag_id = t.id
    LEFT JOIN garments g ON r.garment_id = g.id
    LEFT JOIN hanging_records h ON r.hang_id = h.id
    LEFT JOIN display_areas da ON h.area_id = da.id
    LEFT JOIN users u ON r.recover_operator_id = u.id
    WHERE r.status = '待回收确认' ORDER BY r.recover_time ASC LIMIT 20`).all();

  const frequentSwaps = db.prepare(`SELECT h.id as hang_id, t.tag_code, g.garment_name, COUNT(s.id) as swap_count,
    MIN(s.swap_time) as first_swap, MAX(s.swap_time) as last_swap
    FROM swap_records s
    JOIN hanging_records h ON s.original_hang_id = h.id
    JOIN tags t ON h.tag_id = t.id
    JOIN garments g ON h.garment_id = g.id
    WHERE s.swap_time >= datetime('now', '-30 day')
    GROUP BY h.id HAVING swap_count >= 3
    ORDER BY swap_count DESC LIMIT 10`).all();

  const overdueRecovery = db.prepare(`SELECT r.*, t.tag_code, g.garment_name, 
    julianday('now') - julianday(r.recover_time) as overdue_days
    FROM recovery_records r
    LEFT JOIN tags t ON r.tag_id = t.id
    LEFT JOIN garments g ON r.garment_id = g.id
    WHERE r.status = '待回收确认' AND julianday('now') - julianday(r.recover_time) > 2
    ORDER BY overdue_days DESC`).all();

  const missingReviewGap = db.prepare(`SELECT m.id, m.record_no, m.missing_type, m.missing_description,
    m.report_time, t.tag_code, g.garment_name,
    julianday('now') - julianday(m.report_time) as pending_days
    FROM missing_part_notes m
    LEFT JOIN tags t ON m.tag_id = t.id
    LEFT JOIN garments g ON m.garment_id = g.id
    WHERE m.status = '未处理' AND julianday('now') - julianday(m.report_time) > 3
    ORDER BY pending_days DESC`).all();

  const trendData = db.prepare(`SELECT 
    date(hang_time) as date,
    SUM(CASE WHEN status IN ('已挂装','待调换','待回收确认') THEN 1 ELSE 0 END) as hang_count
    FROM hanging_records 
    WHERE hang_time >= date('now', '-30 day')
    GROUP BY date(hang_time) ORDER BY date ASC`).all();

  res.json({
    data: {
      summary: {
        totalTags, totalGarments, totalHanging, pendingRecovery, unhandledMissing,
        statusDistribution
      },
      categoryDistribution,
      areaOccupancy,
      missingTypeStats,
      pendingConfirmList,
      anomalies: {
        frequentSwaps,
        overdueRecovery,
        missingReviewGap
      },
      trendData
    }
  });
});

app.get('/api/swap-records', authMiddleware, (req, res) => {
  const { page = 1, pageSize = 20, startDate, endDate, keyword } = req.query;
  let sql = `SELECT s.*, 
    oh.record_no as original_hang_no,
    og.garment_code as original_garment_code, og.garment_name as original_garment_name,
    ng.garment_code as new_garment_code, ng.garment_name as new_garment_name,
    oda.area_code as original_area_code, oda.area_name as original_area_name,
    nda.area_code as new_area_code, nda.area_name as new_area_name,
    t.tag_code, u.real_name as operator_name
    FROM swap_records s
    JOIN hanging_records oh ON s.original_hang_id = oh.id
    JOIN tags t ON oh.tag_id = t.id
    JOIN garments og ON oh.garment_id = og.id
    JOIN garments ng ON s.new_garment_id = ng.id
    LEFT JOIN display_areas oda ON oh.area_id = oda.id
    LEFT JOIN display_areas nda ON s.new_area_id = nda.id
    LEFT JOIN users u ON s.operator_id = u.id
    WHERE 1=1`;
  const params = [];
  if (keyword) {
    sql += ' AND (t.tag_code LIKE ? OR s.record_no LIKE ? OR og.garment_name LIKE ? OR ng.garment_name LIKE ?)';
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (startDate) { sql += ' AND s.swap_time >= ?'; params.push(startDate); }
  if (endDate) { sql += ' AND s.swap_time <= ?'; params.push(endDate + ' 23:59:59'); }
  sql += ' ORDER BY s.id DESC';
  const total = db.prepare(`SELECT COUNT(*) as c FROM (${sql})`).get(...params).c;
  const offset = (page - 1) * pageSize;
  const data = db.prepare(sql + ' LIMIT ? OFFSET ?').all(...params, Number(pageSize), offset);
  res.json({ data, total, page: Number(page), pageSize: Number(pageSize) });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: '服务器内部错误', error: err.message });
});

app.listen(PORT, () => {
  console.log(`样衣挂牌管理系统后端已启动: http://localhost:${PORT}`);
});
