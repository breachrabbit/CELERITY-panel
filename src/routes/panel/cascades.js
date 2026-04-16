const router = require('express').Router();

const { render } = require('./helpers');

router.get('/cascades/builder', async (req, res) => {
    render(res, 'cascade-builder', {
        title: res.locals.t('cascades.builderTitle'),
        page: 'cascades',
    });
});

module.exports = router;
