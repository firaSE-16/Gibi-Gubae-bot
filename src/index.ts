import express, { Request, Response } from 'express';
import { Telegraf, Markup } from 'telegraf';
import { MongoClient, Db, Collection } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import { KeyboardButton } from 'telegraf/typings/core/types/typegram';
import dotenv from "dotenv";
dotenv.config();

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
const backButtonEmoji = '◄️';
const deleteEmoji = '🗑️';
const stopEmoji = '🛑';

// Interfaces
interface Question {
  id: string;
  text: string;
  startTime: string;
  endTime?: string;
}

interface Answer {
  user_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  message_id: number;
  questionId: string;
  timestamp: string;
  text: string;
  chatId: number;
}

interface UserQuestion {
  user_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  message_id: number;
  timestamp: string;
  text: string;
}

interface Comment {
  user_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  message_id: number;
  text: string;
}

interface CommonInfo {
  text: string;
}

// Database setup
let db: Db;
async function connectToMongo() {
  const client = new MongoClient(MONGODB_URI!);
  await client.connect();
  db = client.db(DB_NAME);
}

// Initialize Express and Telegraf
const app = express();
const bot = new Telegraf(TELEGRAM_API_TOKEN!);
app.use(express.json());
app.use(bot.webhookCallback('/webhook'));

// Button creation utility
function createButtons(elements: { text: string; id: string }[], width: number) {
  const buttons: KeyboardButton[][] = [];
  const validElements = elements.filter((el) => el.text && el.text.trim() !== '');
  if (width > 1 && width <= 3 && validElements.length > 3) {
    for (let i = 0; i < validElements.length; i += width) {
      const row = validElements.slice(i, i + width).map((el) => Markup.button.text(el.text));
      buttons.push(row);
    }
  } else {
    for (const element of validElements) {
      buttons.push([Markup.button.text(element.text)]);
    }
  }
  return Markup.keyboard(buttons).resize().reply_markup;
}

// Button markups
const backMarkup = createButtons([{ text: `${backButtonEmoji} ተመለስ`, id: 'back' }], 1);
const adminHomeMarkup = createButtons(
  [
    { text: `${adminQuestionEmoji} ጥያቄ ጨምር`, id: 'add_question' },
    { text: `${answerEmoji} መልሶችን ለማየት`, id: 'view_answers' },
    { text: `${commentEmoji} አስተያየቶችን ለማየት`, id: 'view_comments' },
    { text: `${questionEmoji} የተጠየቁ ጥያቄዎችን ለማየት`, id: 'view_user_questions' },
    { text: `${infoEmoji} መረጃ ለመጨመር`, id: 'add_info' },
    { text: `${deleteEmoji} ጥያቄ/መልስ ሰርዝ`, id: 'delete' },
    { text: `${stopEmoji} ጥያቄ አቁም`, id: 'stop_question' },
  ],
  3
);
const userHomeMarkup = createButtons(
  [
    { text: `${answerEmoji} መልስ ለመመለስ`, id: 'answer' },
    { text: `${commentEmoji} አስተያየት ለመስጠት`, id: 'comment' },
    { text: `${questionEmoji} ጥያቄ ለመጠየቅ`, id: 'ask_question' },
    { text: `${infoEmoji} መረጃ ለማግኘት`, id: 'get_info' },
    { text: `${questionEmoji} የአሁኑ ጥያቄ`, id: 'current_question' },
    { text: `${questionEmoji} ያለፉ ጥያቄዎች`, id: 'past_questions' },
  ],
  2
);

// Global state
let mode = 0;
let admins: number[] = [];
let deleteOptions: { text: string; id: string }[] = [];
const questionOptionsMap: Map<number, { text: string; id: string }[]> = new Map();

// Normalize text for comparison (used only for button matching)
function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').normalize('NFC');
}

// Initialize database and load admins
async function initialize() {
  await connectToMongo();
  const adminsCollection = db.collection('admins');
  const adminsData = await adminsCollection.findOne({ key: 'admins' });
  if (!adminsData) {
    await adminsCollection.insertOne({ key: 'admins', value: [6473677687] });
    admins = [6473677687];
  } else {
    admins = adminsData.value;
  }
}

// Bot handlers
bot.command('start', async (ctx) => {
  const chatId = ctx.chat.id;
  if (admins.includes(chatId)) {
    await ctx.reply('እንኳን ደህና መጣህ አስተዳዳሪ።', { reply_markup: adminHomeMarkup });
  } else {
    await ctx.reply('እንኳን ወደ ፭ ኪሎ ግቢ ጉባኤ ጥያቄና መልስ መወዳደሪያ ቦት መጡ ።', {
      reply_markup: userHomeMarkup,
    });
  }
});

bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text;
  const messageId = ctx.message.message_id;
  const username = ctx.from?.username || 'Unknown User';
  const first_name = ctx.from?.first_name;
  const last_name = ctx.from?.last_name;
  if (text.includes(backButtonEmoji)) {
    mode = 0;
    deleteOptions = [];
    questionOptionsMap.delete(chatId);
    if (admins.includes(chatId)) {
      await ctx.reply('እንኳን ደህና መጣህ አስተዳዳሪ።', { reply_markup: adminHomeMarkup });
    } else {
      await ctx.reply('እንኳን ወደ ፭ ኪሎ ግቢ ጉባኤ ጥያቄና መልስ መወዳደሪዪ ቦት መጡ ።', {
        reply_markup: userHomeMarkup,
      });
    }
  } else if (admins.includes(chatId)) {
    await handleAdmin(ctx, text, chatId, messageId, username, first_name, last_name);
  } else {
    await handleUser(ctx, text, chatId, messageId, username, first_name, last_name);
  }
});

async function handleAdmin(ctx: any, text: string, chatId: number, messageId: number, username: string, first_name?: string, last_name?: string) {
  const answersCollection = db.collection('answers');
  const userQuestionsCollection = db.collection('user_questions');
  const commentsCollection = db.collection('comments');
  const oldQuestionsCollection = db.collection('old_questions');
  const currentQuestionCollection = db.collection('current_question');
  const commonInfoCollection = db.collection('common_information');

  if (text.includes(adminQuestionEmoji)) {
    mode = 1;
    await ctx.reply('አዲስ ጥያቄ እዚህ ላክ።', { reply_markup: backMarkup });
  } else if (text.includes(infoEmoji)) {
    mode = 5;
    await ctx.reply('አዲስ መረጃ እዚህ ላክ።', { reply_markup: backMarkup });
  } else if (text.includes(answerEmoji) && text.includes('መልሶችን ለማየት')) {
    mode = 2;
    const questionOptions: { text: string; id: string }[] = [];
    const oldQuestions = await oldQuestionsCollection.find().toArray();
    const currentQuestion = await currentQuestionCollection.findOne({});
    if (currentQuestion) {
      questionOptions.push({ text: `ID: ${currentQuestion.id}`, id: currentQuestion.id });
    }
    oldQuestions.forEach((q) => {
      questionOptions.push({ text: `ID: ${q.id}`, id: q.id });
    });
    if (questionOptions.length === 0) {
      await ctx.reply('ምንም ጥያቄዎች የሉም።', { reply_markup: backMarkup });
      return;
    }
    questionOptionsMap.set(chatId, questionOptions);
    await ctx.reply('ለመልሶች የሚፈልጉትን ጥያቄ መለያ (ID) ይምረጡ:', {
      reply_markup: createButtons([...questionOptions, { text: `${backButtonEmoji} ተመለስ`, id: 'back' }], 1),
    });
  } else if (text.includes(commentEmoji)) {
    mode = 3;
    const comments = await commentsCollection.find().toArray();
    if (comments.length === 0) {
      await ctx.reply('ምንም አስተያየቶች የሉም።', { reply_markup: backMarkup });
      return;
    }
    for (const comment of comments) {
      await ctx.forwardMessage(chatId, comment.user_id, comment.message_id);
      const name = comment.first_name ? 
        (comment.last_name ? `${comment.first_name} ${comment.last_name}` : comment.first_name) : 
        (comment.username || 'Unknown');
      await ctx.reply(
        `አስተያየት: ${comment.text}\nተጠቃሚ: ${name}\nጊዜ: ${moment(comment.timestamp).format('YYYY-MM-DD HH:mm:ss')}`
      );
    }
    await ctx.reply('እስከ አሁን ድረስ የተሰጡ አስተያየቶች እነዚህ ነበሩ።', { reply_markup: backMarkup });
  } else if (text.includes(questionEmoji) && text.includes('የተጠየቁ ጥያቄዎችን ለማየት')) {
    mode = 4;
    const userQuestions = await userQuestionsCollection.find().toArray();
    if (userQuestions.length === 0) {
      await ctx.reply('ምንም የተጠየቁ ጥያቄዎች የሉም።', { reply_markup: backMarkup });
      return;
    }
    for (const question of userQuestions) {
      await ctx.forwardMessage(chatId, question.user_id, question.message_id);
      const name = question.first_name ? 
        (question.last_name ? `${question.first_name} ${question.last_name}` : question.first_name) : 
        (question.username || 'Unknown');
      await ctx.reply(
        `ጥያቄ: ${question.text}\nተጠቃሚ: ${name}\nጊዜ: ${moment(question.timestamp).format('YYYY-MM-DD HH:mm:ss')}`
      );
    }
    await ctx.reply('እነዚህ ከተጠቃሚዎች የተላለፉ ጥያቄዎች ነበሩ።', { reply_markup: backMarkup });
  } else if (text.includes(deleteEmoji)) {
    mode = 7;
    deleteOptions = [];
    const answers = await answersCollection.find().toArray();
    const userQuestions = await userQuestionsCollection.find().toArray();
    const oldQuestions = await oldQuestionsCollection.find().toArray();
    const currentQuestion = await currentQuestionCollection.findOne({});
    deleteOptions.push(...answers.map((a, i) => {
      const name = a.first_name ? 
        (a.last_name ? `${a.first_name} ${a.last_name}` : a.first_name) : 
        (a.username || 'Unknown');
      return {
        text: `Answer ${i + 1}: ${a.text} (by ${name}, ${moment(a.timestamp).format('YYYY-MM-DD HH:mm:ss')})`,
        id: `answer_${a.message_id}`
      };
    }));
    deleteOptions.push(...userQuestions.map((q, i) => {
      const name = q.first_name ? 
        (q.last_name ? `${q.first_name} ${q.last_name}` : q.first_name) : 
        (q.username || 'Unknown');
      return {
        text: `Question ${i + 1}: ${q.text} (by ${name}, ${moment(q.timestamp).format('YYYY-MM-DD HH:mm:ss')})`,
        id: `question_${q.message_id}`
      };
    }));
    if (currentQuestion) {
      deleteOptions.push({ text: `Current Question: ${currentQuestion.text}`, id: `current_${currentQuestion.id}` });
    }
    deleteOptions.push(...oldQuestions.map((q, i) => ({
      text: `Old Question ${i + 1}: ${q.text} (${moment(q.startTime).format('YYYY-MM-DD HH:mm:ss')} - ${q.endTime ? moment(q.endTime).format('YYYY-MM-DD HH:mm:ss') : 'Now'})`,
      id: `old_${q.id}`
    })));
    if (deleteOptions.length === 0) {
      await ctx.reply('ለመሰረዝ ምንም ጥያቄዎች ወይም መልሶች የሉም።', { reply_markup: backMarkup });
      return;
    }
await ctx.reply("ለመሰረዝ ይምረጡ:", {
  reply_markup: createButtons(
    [
      ...deleteOptions,
      { text: `${backButtonEmoji} ተመለስ`, id: "back" }
    ],
    1
  ),
});
  } else if (text.includes(stopEmoji)) {
    const currentQuestion = await currentQuestionCollection.findOne({});
    if (currentQuestion) {
      await oldQuestionsCollection.insertOne({
        id: currentQuestion.id,
        text: currentQuestion.text,
        startTime: currentQuestion.startTime,
        endTime: moment().toISOString(),
      });
      await currentQuestionCollection.deleteOne({});
      await ctx.reply('የአሁኑ ጥያቄ ተቋርጧል።', { reply_markup: adminHomeMarkup });
    } else {
      await ctx.reply('ምንም የአሁኑ ጥያቄ የለም።', { reply_markup: adminHomeMarkup });
    }
    mode = 0;
  } else {
    if (mode === 1) {
      const currentQuestion = await currentQuestionCollection.findOne({});
      if (currentQuestion) {
        await oldQuestionsCollection.insertOne({
          id: currentQuestion.id,
          text: currentQuestion.text,
          startTime: currentQuestion.startTime,
          endTime: moment().toISOString(),
        });
        await currentQuestionCollection.deleteOne({});
      }
      const newQuestionId = uuidv4();
      await currentQuestionCollection.insertOne({
        id: newQuestionId,
        text, // Store text as-is
        startTime: moment().toISOString(),
      });
      await ctx.reply('አዲሱ ጥያቄ ተቀምጧል። የዕለቱ ጥያቄና መልስ ውድድር በነገ ማታ 3:30 ይጀምራል።', { reply_markup: adminHomeMarkup });
    } else if (mode === 5) {
      await commonInfoCollection.insertOne({ text }); // Store text as-is
      await ctx.reply('አዲሱ መረጃ ተቀምጧል።', { reply_markup: adminHomeMarkup });
    } else if (mode === 2) {
      const questionOptions = questionOptionsMap.get(chatId) || [];
      const selectedQuestionId = questionOptions.find((option) => text === `ID: ${option.id}`)?.id;
      if (selectedQuestionId) {
        const question = (await currentQuestionCollection.findOne({ id: selectedQuestionId })) ||
                        (await oldQuestionsCollection.findOne({ id: selectedQuestionId }));
        const answers = await answersCollection.find({ questionId: selectedQuestionId }).toArray();
        if (answers.length === 0) {
          await ctx.reply(`ለጥያቄ "${question!.text}" ምንም መልሶች የሉም።`, { reply_markup: backMarkup });
          return;
        }
        for (const answer of answers) {
          await bot.telegram.forwardMessage(
  chatId,        // chat to forward to
  answer.chatId,        // from which chat
  answer.message_id      // which message
);
          const name = answer.first_name ? 
            (answer.last_name ? `${answer.first_name} ${answer.last_name}` : answer.first_name) : 
            (answer.username || 'Unknown');
          await ctx.reply(
            `ተጠቃሚ: ${name}\n username: ${`@${answer.username}` || "username የለም"}\n`
          );
        }
        mode = 0;
        questionOptionsMap.delete(chatId);
      } else {
        await ctx.reply('እባክዎ ትክክለኛ ጥያቄ መለያ (ID) ይምረጡ።', { reply_markup: backMarkup });
      }
    } else if (mode === 7) {
      const selectedOption = deleteOptions.find((option) => normalizeText(option.text) === normalizeText(text));
      if (selectedOption) {
        if (selectedOption.id.startsWith('answer_')) {
          const messageId = parseInt(selectedOption.id.split('_')[1]);
          await answersCollection.deleteOne({ message_id: messageId });
        } else if (selectedOption.id.startsWith('question_')) {
          const messageId = parseInt(selectedOption.id.split('_')[1]);
          await userQuestionsCollection.deleteOne({ message_id: messageId });
        } else if (selectedOption.id.startsWith('current_')) {
          await currentQuestionCollection.deleteOne({});
        } else if (selectedOption.id.startsWith('old_')) {
          const questionId = selectedOption.id.split('_')[1];
          await oldQuestionsCollection.deleteOne({ id: questionId });
        }
        await ctx.reply('ጥያቄ ወይም መልስ ተሰርዟል።', { reply_markup: adminHomeMarkup });
        mode = 0;
        deleteOptions = [];
      }
    }
  }
}

async function handleUser(ctx: any, text: string, chatId: number, messageId: number, username: string, first_name?: string, last_name?: string) {
  const answersCollection = db.collection('answers');
  const userQuestionsCollection = db.collection('user_questions');
  const commentsCollection = db.collection('comments');
  const commonInfoCollection = db.collection('common_information');
  const currentQuestionCollection = db.collection('current_question');
  const oldQuestionsCollection = db.collection('old_questions');

  if (text.includes(answerEmoji) && text.includes('መልስ ለመመለስ')) {
    mode = 1;
    const currentQuestion = await currentQuestionCollection.findOne({});
    if (!currentQuestion) {
      await ctx.reply('የዕለቱ ጥያቄና መልስ ውድድር ማታ 3:30 ላይ ይጀምራል።', { reply_markup: userHomeMarkup });
    } else {
      await ctx.reply(currentQuestion.text, { reply_markup: backMarkup });
      await ctx.reply('መልስዎን እዚህ ይላኩ።', { reply_markup: backMarkup });
    }
  } else if (text.includes(commentEmoji)) {
    mode = 2;
    await ctx.reply('አስተያየትዎን እዚህ ይላኩ።', { reply_markup: backMarkup });
  } else if (text.includes(questionEmoji) && text.includes('ጥያቄ ለመጠየቅ')) {
    mode = 3;
    await ctx.reply('ጥያቄዎን እዚህ ይላኩ።', { reply_markup: backMarkup });
  } else if (text.includes(infoEmoji)) {
    mode = 4;
    const infos = await commonInfoCollection.find().toArray();
    if (infos.length === 0) {
      await ctx.reply('ምንም መረጃ የለም።', { reply_markup: backMarkup });
    } else {
      for (const info of infos) {
        await ctx.reply(info.text);
      }
    }
  } else if (text.includes('የአሁኑ ጥያቄ')) {
    mode = 1;
    const currentQuestion = await currentQuestionCollection.findOne({});
    if (!currentQuestion) {
      await ctx.reply('ምንም የአሁኑ ጥያቄ የለም።', { reply_markup: backMarkup });
    } else {
      await ctx.reply(currentQuestion.text, { reply_markup: backMarkup });
      await ctx.reply('መልስዎን እዚህ ይላኩ።', { reply_markup: backMarkup });
    }
  } else if (text.includes('ያለፉ ጥያቄዎች')) {
    mode = 0;
    const oldQuestions = await oldQuestionsCollection.find().toArray();
    if (!oldQuestions.length) {
      await ctx.reply('ምንም ያለፉ ጥያቄዎች የሉም።', { reply_markup: backMarkup });
    } else {
      for (const question of oldQuestions) {
        await ctx.reply(`${question.text}\nጊዜ: ${moment(question.startTime).format('YYYY-MM-DD HH:mm:ss')} - ${question.endTime ? moment(question.endTime).format('YYYY-MM-DD HH:mm:ss') : 'Now'}`);
      }
      await ctx.reply('ከላይ ያሉት ያለፉ ጥያቄዎች ናቸው።', { reply_markup: backMarkup });
    }
  } else {
    if (mode === 0) {
      await ctx.reply('እንኳን ወደ ፭ ኪሎ ግቢ ጉባኤ ጥያቄና መልስ መወዳደሪያ ቦት መጡ ።', {
        reply_markup: userHomeMarkup,
      });
    } else if (mode === 1) {
      const currentQuestion = await currentQuestionCollection.findOne({});
      if (currentQuestion) {
        await answersCollection.insertOne({
          user_id: chatId,
          username,
          first_name,
          last_name,
          message_id: messageId,
          questionId: currentQuestion.id,
          timestamp: moment().toISOString(),
          text, // Store text as-is
          chatId,
        });
        await ctx.reply('መልስዎ ተቀምጧል። እናመሰግናለን።', { reply_markup: userHomeMarkup });
      }
    } else if (mode === 2) {
      await commentsCollection.insertOne({
        user_id: chatId,
        username,
        first_name,
        last_name,
        message_id: messageId,
        text, // Store text as-is
      });
      await ctx.reply('አስተያየትዎ ተቀምጧል። እናመሰግናለን።', { reply_markup: userHomeMarkup });
    } else if (mode === 3) {
      await userQuestionsCollection.insertOne({
        user_id: chatId,
        username,
        first_name,
        last_name,
        message_id: messageId,
        timestamp: moment().toISOString(),
        text, // Store text as-is
      });
      await ctx.reply('ጥያቄዎ ተቀምጧል። እናመሰግናለን።', { reply_markup: userHomeMarkup });
    }
  }
}

// Express route for health check
app.get('/', (req: Request, res: Response) => {
  res.send('Telegram bot is running');
});

// Start server and bot
async function start() {
  await initialize();
  // Set webhook for Render deployment
  await bot.telegram.setWebhook('https://api.telegram.org/bot6169329044:AAGsYblOlSJ3L1DZXrJvmBWyGO1-vkWORFI/setWebhook?url=https://gibi-gubae-bot.onrender.com/%3Cyour-path%3E');
  bot.launch();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
start().catch(console.error);