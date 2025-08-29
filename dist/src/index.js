"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const telegraf_1 = require("telegraf");
const mongodb_1 = require("mongodb");
const uuid_1 = require("uuid");
const moment_1 = __importDefault(require("moment"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Configuration
const TELEGRAM_API_TOKEN = process.env.TELEGRAM_API_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'telegram_bot';
const PORT = process.env.PORT || 3000;
// Emojis for UI
const adminQuestionEmoji = '🖋';
const answerEmoji = '✍️';
const commentEmoji = '📖';
const questionEmoji = '❓';
const infoEmoji = 'ℹ️';
const adminEmoji = '👨🏽‍💻';
const backButtonEmoji = '◀️';
const deleteEmoji = '🗑️';
// Database setup
let db;
function connectToMongo() {
    return __awaiter(this, void 0, void 0, function* () {
        const client = new mongodb_1.MongoClient(MONGODB_URI);
        yield client.connect();
        db = client.db(DB_NAME);
        console.log('Connected to MongoDB');
    });
}
// Initialize Express and Telegraf
const app = (0, express_1.default)();
const bot = new telegraf_1.Telegraf(TELEGRAM_API_TOKEN);
app.use(express_1.default.json());
app.use(bot.webhookCallback('/webhook'));
// Button creation utility
function createButtons(elements, width) {
    const buttons = [];
    if (width > 1 && width <= 3 && elements.length > 3) {
        while (elements.length % 3 !== 0) {
            elements.push('');
        }
        if (width === 2) {
            for (let i = 0; i < elements.length; i += 2) {
                buttons.push([telegraf_1.Markup.button.text(elements[i]), telegraf_1.Markup.button.text(elements[i + 1])]);
            }
        }
        else if (width === 3) {
            for (let i = 0; i < elements.length; i += 3) {
                buttons.push([
                    telegraf_1.Markup.button.text(elements[i]),
                    telegraf_1.Markup.button.text(elements[i + 1]),
                    telegraf_1.Markup.button.text(elements[i + 2]),
                ]);
            }
        }
    }
    else {
        for (const element of elements) {
            buttons.push([telegraf_1.Markup.button.text(element)]);
        }
    }
    return telegraf_1.Markup.keyboard(buttons).resize().reply_markup;
}
// Button markups
const backMarkup = createButtons([`${backButtonEmoji} ተመለስ`], 1);
const adminHomeMarkup = createButtons([
    `${adminQuestionEmoji} ጥያቄ ጨምር`,
    `${answerEmoji} መልሶችን ለማየት`,
    `${commentEmoji} አስተያየቶችን ለማየት`,
    `${questionEmoji} የተጠየቁ ጥያቄዎችን ለማየት`,
    `${infoEmoji} መረጃ ለመጨመር`,
    `${adminEmoji} የተጠቃሚ ዝርዝር`,
    `${deleteEmoji} ጥያቄ/መልስ ሰርዝ`,
], 3);
const userHomeMarkup = createButtons([
    `${answerEmoji} መልስ ለመመለስ`,
    `${commentEmoji} አስተያየት ለመስጠት`,
    `${questionEmoji} ጥያቄ ለመጠየቅ`,
    `${infoEmoji} መረጃ ለማግኘት`,
    `${questionEmoji} የአሁኑ ጥያቄ`,
    `${questionEmoji} ያለፉ ጥያቄዎች`,
], 2);
// Global state
let mode = 0;
let admins = [];
let deleteOptions = [];
let questionOptions = [];
// Initialize database and load admins
function initialize() {
    return __awaiter(this, void 0, void 0, function* () {
        yield connectToMongo();
        const adminsCollection = db.collection('admins');
        const adminsData = yield adminsCollection.findOne({ key: 'admins' });
        if (!adminsData) {
            yield adminsCollection.insertOne({ key: 'admins', value: [6473677687] });
            admins = [6473677687];
        }
        else {
            admins = adminsData.value;
        }
    });
}
// Bot handlers
bot.command('start', (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    const chatId = ctx.chat.id;
    if (admins.includes(chatId)) {
        yield ctx.reply('እንኳን ደህና መጣህ አስተዳዳሪ።', { reply_markup: adminHomeMarkup });
    }
    else {
        yield ctx.reply('እንኳን ወደ ፭ ኪሎ ግቢ ጉባኤ ጥያቄና መልስ መወዳደሪያ ቦት መጡ ።', {
            reply_markup: userHomeMarkup,
        });
    }
}));
bot.on('text', (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const chatId = ctx.chat.id;
    const text = ctx.message.text;
    const messageId = ctx.message.message_id;
    const username = ((_a = ctx.from) === null || _a === void 0 ? void 0 : _a.username) || 'Unknown User';
    if (text.includes(backButtonEmoji)) {
        mode = 0;
        deleteOptions = [];
        questionOptions = [];
        if (admins.includes(chatId)) {
            yield ctx.reply('እንኳን ደህና መጣህ አስተዳዳሪ።', { reply_markup: adminHomeMarkup });
        }
        else {
            yield ctx.reply('እንኳን ወደ ፭ ኪሎ ግቢ ጉባኤ ጥያቄና መልስ መወዳደሪያ ቦት መጡ ።', {
                reply_markup: userHomeMarkup,
            });
        }
    }
    else if (admins.includes(chatId)) {
        yield handleAdmin(ctx, text, chatId, messageId, username);
    }
    else {
        yield handleUser(ctx, text, chatId, messageId, username);
    }
}));
function handleAdmin(ctx, text, chatId, messageId, username) {
    return __awaiter(this, void 0, void 0, function* () {
        const answersCollection = db.collection('answers');
        const userQuestionsCollection = db.collection('user_questions');
        const commentsCollection = db.collection('comments');
        const oldQuestionsCollection = db.collection('old_questions');
        const currentQuestionCollection = db.collection('current_question');
        const commonInfoCollection = db.collection('common_information');
        if (text.includes(adminQuestionEmoji)) {
            mode = 1;
            yield ctx.reply('አዲስ ጥያቄ እዚህ ላክ።', { reply_markup: backMarkup });
        }
        else if (text.includes(infoEmoji)) {
            mode = 5;
            yield ctx.reply('አዲስ መረጃ እዚህ ላክ።', { reply_markup: backMarkup });
        }
        else if (text.includes(answerEmoji)) {
            mode = 2;
            questionOptions = [];
            const oldQuestions = yield oldQuestionsCollection.find().toArray();
            const currentQuestion = yield currentQuestionCollection.findOne({});
            if (currentQuestion) {
                questionOptions.push(`Current Question: ${currentQuestion.text} (${(0, moment_1.default)(currentQuestion.timestamp).format('YYYY-MM-DD HH:mm:ss')})`);
            }
            questionOptions.push(...oldQuestions.map((q, i) => `Old Question ${i + 1}: ${q.text} (${(0, moment_1.default)(q.timestamp).format('YYYY-MM-DD HH:mm:ss')})`));
            if (questionOptions.length === 0) {
                yield ctx.reply('ምንም ጥያቄዎች የሉም።', { reply_markup: backMarkup });
                return;
            }
            yield ctx.reply('ለመልሶች የሚፈልጉትን ጥያቄ ይምረጡ:', {
                reply_markup: createButtons([...questionOptions, `${backButtonEmoji} ተመለስ`], 1)
            });
        }
        else if (text.includes(commentEmoji)) {
            mode = 3;
            const comments = yield commentsCollection.find().toArray();
            if (comments.length === 0) {
                yield ctx.reply('ምንም አስተያየቶች የሉም።');
                return;
            }
            for (const comment of comments) {
                yield ctx.forwardMessage(chatId, comment.user_id, comment.message_id);
                yield ctx.reply(`አስተያየት: ${comment.text}\nተጠቃሚ: ${comment.username || 'Unknown'}\nጊዜ: ${(0, moment_1.default)(comment.timestamp).format('YYYY-MM-DD HH:mm:ss')}`);
            }
            yield ctx.reply('እስከ አሁን ድረስ የተሰጡ አስተያየቶች እነዚህ ነበሩ።', { reply_markup: backMarkup });
        }
        else if (text.includes(questionEmoji)) {
            mode = 4;
            const userQuestions = yield userQuestionsCollection.find().toArray();
            if (userQuestions.length === 0) {
                yield ctx.reply('ምንም የተጠየቁ ጥያቄዎች የሉም።');
                return;
            }
            for (const question of userQuestions) {
                yield ctx.forwardMessage(chatId, question.user_id, question.message_id);
                yield ctx.reply(`ጥያቄ: ${question.text}\nተጠቃሚ: ${question.username || 'Unknown'}\nጊዜ: ${(0, moment_1.default)(question.timestamp).format('YYYY-MM-DD HH:mm:ss')}`);
            }
            yield ctx.reply('እነዚህ ከተጠቃሚዎች የተላለፉ ጥ�iyaቄዎች ነበሩ።', { reply_markup: backMarkup });
        }
        else if (text.includes(adminEmoji)) {
            mode = 6;
            const answers = yield answersCollection.find().toArray();
            const userQuestions = yield userQuestionsCollection.find().toArray();
            const userList = [
                ...answers.map((a) => `ተጠቃሚ: ${a.username || 'Unknown'} (ID: ${a.user_id}), መልስ ለጥያቄ: ${a.question}, ጊዜ: ${(0, moment_1.default)(a.timestamp).format('YYYY-MM-DD HH:mm:ss')}`),
                ...userQuestions.map((q) => `ተጠቃሚ: ${q.username || 'Unknown'} (ID: ${q.user_id}), ጥያቄ: ${q.text}, ጊዜ: ${(0, moment_1.default)(q.timestamp).format('YYYY-MM-DD HH:mm:ss')}`),
            ].sort((a, b) => a.split('ጊዜ: ')[1].localeCompare(b.split('ጊዜ: ')[1]));
            yield ctx.reply(userList.length ? userList.join('\n') : 'ምንም ተጠቃሚ የለም።', { reply_markup: backMarkup });
        }
        else if (text.includes(deleteEmoji)) {
            mode = 7;
            deleteOptions = [];
            const answers = yield answersCollection.find().toArray();
            const userQuestions = yield userQuestionsCollection.find().toArray();
            const oldQuestions = yield oldQuestionsCollection.find().toArray();
            const currentQuestion = yield currentQuestionCollection.findOne({});
            deleteOptions.push(...answers.map((a, i) => `Answer ${i + 1}: ${a.text} (by ${a.username || 'Unknown'}, ${(0, moment_1.default)(a.timestamp).format('YYYY-MM-DD HH:mm:ss')})`));
            deleteOptions.push(...userQuestions.map((q, i) => `Question ${i + 1}: ${q.text} (by ${q.username || 'Unknown'}, ${(0, moment_1.default)(q.timestamp).format('YYYY-MM-DD HH:mm:ss')})`));
            if (currentQuestion) {
                deleteOptions.push(`Current Question: ${currentQuestion.text} (${(0, moment_1.default)(currentQuestion.timestamp).format('YYYY-MM-DD HH:mm:ss')})`);
            }
            deleteOptions.push(...oldQuestions.map((q, i) => `Old Question ${i + 1}: ${q.text} (${(0, moment_1.default)(q.timestamp).format('YYYY-MM-DD HH:mm:ss')})`));
            if (deleteOptions.length === 0) {
                yield ctx.reply('ለመሰረዝ ምንም ጥያቄዎች ወይም መልሶች የሉም።', { reply_markup: backMarkup });
                return;
            }
            yield ctx.reply('ለመሰረዝ ይምረጡ:', { reply_markup: createButtons([...deleteOptions, `${backButtonEmoji} ተመለስ`], 1) });
        }
        else {
            if (mode === 1) {
                const currentQuestion = yield currentQuestionCollection.findOne({});
                if (currentQuestion) {
                    yield oldQuestionsCollection.insertOne({
                        id: currentQuestion.id,
                        text: currentQuestion.text,
                        timestamp: currentQuestion.timestamp,
                    });
                    yield currentQuestionCollection.deleteOne({});
                }
                yield currentQuestionCollection.insertOne({
                    id: (0, uuid_1.v4)(),
                    text,
                    timestamp: (0, moment_1.default)().toISOString(),
                });
                yield ctx.reply('አዲሱ ጥያቄ ተቀምጧል።', { reply_markup: adminHomeMarkup });
            }
            else if (mode === 5) {
                yield commonInfoCollection.insertOne({ text });
                yield ctx.reply('አዲሱ መረጃ ተቀምጧል።', { reply_markup: adminHomeMarkup });
            }
            else if (mode === 2) {
                const selectedIndex = questionOptions.findIndex((option) => option === text);
                if (selectedIndex >= 0) {
                    const selectedQuestion = questionOptions[selectedIndex];
                    const questionText = selectedQuestion.split(': ')[1].split(' (')[0];
                    const answers = yield answersCollection.find({ question: questionText }).toArray();
                    if (answers.length === 0) {
                        yield ctx.reply(`ለጥያቄ "${questionText}" ምንም መልሶች የሉም።`, { reply_markup: backMarkup });
                        return;
                    }
                    for (const answer of answers) {
                        yield ctx.forwardMessage(chatId, answer.user_id, answer.message_id);
                        yield ctx.reply(`መልስ: ${answer.text}\nተጠቃሚ: ${answer.username || 'Unknown'}\nጊዜ: ${(0, moment_1.default)(answer.timestamp).format('YYYY-MM-DD HH:mm:ss')}`);
                    }
                    yield ctx.reply(`ለጥያቄ "${questionText}" መልሶች እነዚህ ናቸው።`, { reply_markup: backMarkup });
                    mode = 0;
                    questionOptions = [];
                }
            }
            else if (mode === 7) {
                const selectedIndex = deleteOptions.findIndex((option) => option === text);
                if (selectedIndex >= 0) {
                    const selectedOption = deleteOptions[selectedIndex];
                    if (selectedOption.startsWith('Answer')) {
                        const answerIndex = parseInt(selectedOption.split(':')[0].replace('Answer ', '')) - 1;
                        const answers = yield answersCollection.find().toArray();
                        yield answersCollection.deleteOne({ message_id: answers[answerIndex].message_id });
                    }
                    else if (selectedOption.startsWith('Question')) {
                        const questionIndex = parseInt(selectedOption.split(':')[0].replace('Question ', '')) - 1;
                        const userQuestions = yield userQuestionsCollection.find().toArray();
                        yield userQuestionsCollection.deleteOne({ message_id: userQuestions[questionIndex].message_id });
                    }
                    else if (selectedOption.startsWith('Current Question')) {
                        yield currentQuestionCollection.deleteOne({});
                    }
                    else if (selectedOption.startsWith('Old Question')) {
                        const oldQuestionIndex = parseInt(selectedOption.split(':')[0].replace('Old Question ', '')) - 1;
                        const oldQuestions = yield oldQuestionsCollection.find().toArray();
                        yield oldQuestionsCollection.deleteOne({ id: oldQuestions[oldQuestionIndex].id });
                    }
                    yield ctx.reply('ጥያቄ ወይም መልስ ተሰርዟል።', { reply_markup: adminHomeMarkup });
                    mode = 0;
                    deleteOptions = [];
                }
            }
        }
    });
}
function handleUser(ctx, text, chatId, messageId, username) {
    return __awaiter(this, void 0, void 0, function* () {
        const answersCollection = db.collection('answers');
        const userQuestionsCollection = db.collection('user_questions');
        const commentsCollection = db.collection('comments');
        const commonInfoCollection = db.collection('common_information');
        const currentQuestionCollection = db.collection('current_question');
        const oldQuestionsCollection = db.collection('old_questions');
        if (text.includes(answerEmoji)) {
            mode = 1;
            const currentQuestion = yield currentQuestionCollection.findOne({});
            if (!currentQuestion) {
                yield ctx.reply('የዕለቱ ጥያቄና መልስ ውድድር ማታ 3፡30 ላይ ይጀምራል።', { reply_markup: userHomeMarkup });
            }
            else {
                yield ctx.reply(`የአሁኑ ጥያቄ: \n ${currentQuestion.text}`, { reply_markup: backMarkup });
                yield ctx.reply('መልስዎን እዚህ ይላኩ።', { reply_markup: backMarkup });
            }
        }
        else if (text.includes(commentEmoji)) {
            mode = 2;
            yield ctx.reply('አስተያየትዎን እዚህ ይላኩ።', { reply_markup: backMarkup });
        }
        else if (text.includes(questionEmoji) && text.includes('ጥያቄ ለመጠየቅ')) {
            mode = 3;
            yield ctx.reply('ጥያቄዎን እዚህ ይላኩ።', { reply_markup: backMarkup });
        }
        else if (text.includes(infoEmoji)) {
            mode = 4;
            const infos = yield commonInfoCollection.find().toArray();
            if (infos.length === 0) {
                yield ctx.reply('ምንም መረጃ የለም።', { reply_markup: backMarkup });
            }
            else {
                for (const info of infos) {
                    yield ctx.reply(info.text);
                }
                yield ctx.reply('ከአስተዳዳሪዎች የተላለፈው ወቅታዊ መረጃ እነዚህ ናቸው።', { reply_markup: backMarkup });
            }
        }
        else if (text.includes('የአሁኑ ጥያቄ')) {
            mode = 1;
            const currentQuestion = yield currentQuestionCollection.findOne({});
            if (!currentQuestion) {
                yield ctx.reply('ምንም የአሁኑ ጥያቄ የለም።', { reply_markup: backMarkup });
            }
            else {
                yield ctx.reply(`የአሁኑ ጥያቄ: \n ${currentQuestion.text}`, { reply_markup: backMarkup });
                yield ctx.reply('መልስዎን እዚህ ይላኩ።', { reply_markup: backMarkup });
            }
        }
        else if (text.includes('ያለፉ ጥያቄዎች')) {
            mode = 0;
            const oldQuestions = yield oldQuestionsCollection.find().toArray();
            if (!oldQuestions.length) {
                yield ctx.reply('ምንም ያለፉ ጥያቄዎች የሉም።', { reply_markup: backMarkup });
            }
            else {
                for (const question of oldQuestions) {
                    yield ctx.reply(`ጥያቄ: ${question.text}\nጊዜ: ${(0, moment_1.default)(question.timestamp).format('YYYY-MM-DD HH:mm:ss')}`);
                }
                yield ctx.reply('ከላይ ያሉት ያለፉ ጥያቄዎች ናቸው።', { reply_markup: backMarkup });
            }
        }
        else {
            if (mode === 0) {
                yield ctx.reply('እንኳን ወደ ፭ ኪሎ ግቢ ጉባኤ ጥያቄና መልስ መወዳደሪያ ቦት መጡ ።', {
                    reply_markup: userHomeMarkup,
                });
            }
            else if (mode === 1) {
                const currentQuestion = yield currentQuestionCollection.findOne({});
                if (currentQuestion) {
                    yield answersCollection.insertOne({
                        user_id: chatId,
                        username,
                        message_id: messageId,
                        question: currentQuestion.text,
                        timestamp: (0, moment_1.default)().toISOString(),
                        text,
                    });
                    yield ctx.reply('መልስዎ ተቀምጧል። እናመሰግናለን።', { reply_markup: userHomeMarkup });
                }
            }
            else if (mode === 2) {
                yield commentsCollection.insertOne({
                    user_id: chatId,
                    username,
                    message_id: messageId,
                    text,
                });
                yield ctx.reply('አስተያየትዎ ተቀምጧል። እናመሰግናለን።', { reply_markup: userHomeMarkup });
            }
            else if (mode === 3) {
                yield userQuestionsCollection.insertOne({
                    user_id: chatId,
                    username,
                    message_id: messageId,
                    timestamp: (0, moment_1.default)().toISOString(),
                    text,
                });
                yield ctx.reply('ጥያቄዎ ተቀምጧል። እናመሰግናለን።', { reply_markup: userHomeMarkup });
            }
        }
    });
}
// Express route for health check
app.get('/', (req, res) => {
    res.send('Telegram bot is running');
});
// Start server and bot
function start() {
    return __awaiter(this, void 0, void 0, function* () {
        yield initialize();
        bot.launch();
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    });
}
start().catch(console.error);
