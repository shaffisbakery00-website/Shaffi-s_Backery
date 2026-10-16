'use strict';

const router = require('express').Router();
const requireAdmin = require('../middleware/requireAdmin');

router.use('/auth', require('./auth'));
router.use('/menu', require('./menu'));
router.use('/reviews', require('./reviews'));
router.use('/ads', require('./ads'));

router.use('/admin/dishes', requireAdmin, require('./dishes'));
router.use('/admin/sections', requireAdmin, require('./sections'));
router.use('/admin', requireAdmin, require('./admin'));

module.exports = router;
