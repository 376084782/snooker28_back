import SocketServer from "./socket/SocketServer";

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var vertoken = require('./utils/token_vertify');
var expressJwt = require('express-jwt');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');


var app = express();

var bodyParser = require("body-parser");
app.use(bodyParser.json());
app.all('*', function (req, res, next) {
	// 设置请求头为允许跨域
	res.header('Access-Control-Allow-Origin', '*');
	// 设置服务器支持的所有头信息字段
	res.header('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Authorization, Accept, X-Requested-With , yourHeaderFeild, sessionToken');
	// 设置服务器支持的所有跨域请求的方法
	res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, DELETE, OPTIONS');
	if (req.method.toLowerCase() == 'options') {
		res.sendStatus(200); // 让options尝试请求快速结束
	} else {
		next();
	}
});
app.use(function (req, res, next) {
	var token = req.headers['Authorization'] || req.query['token'] || undefined;
	console.log(token)
	if (token == undefined) {
		return next();
	} else {
		vertoken.verToken(token).then((data) => {
			req.data = data;
			return next();
		}).catch((error) => {
			return next();
		})
	}
});

//验证token是否过期并规定哪些路由不用验证
let func = expressJwt.expressjwt || expressJwt;
app.use(func({
	secret: 'mes_qdhd_mobile_xhykjyxgs',
	algorithms: ['HS256']
}).unless({
	path: ['/login', '/room/list', '/avatar']//除了这个地址，其他的URL都需要验证
}))


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({
	extended: false
}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

//当token失效返回提示信息
app.use(function (err, req, res, next) {
	if (err.status == 401) {
		console.log(err)
		return res.send({
			code: 401,
			msg: 'token失效'
		});
	}
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
	next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
	// set locals, only providing error in development
	res.locals.message = err.message;
	res.locals.error = req.app.get('env') === 'development' ? err : {};

	// render the error page
	res.status(err.status || 500);
	res.render('error');
});

module.exports = app;