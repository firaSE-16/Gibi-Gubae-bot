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
const backButtonEmoji = '◀️';
const deleteEmoji = '🗑️';

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
  message_id: number;
  questionId: string;
  timestamp: string;
  text: string;
}

interface UserQuestion {
  user_id: number;
  username?: string;
  message_id: number;
  timestamp: string;
  text: string;
}

interface Comment {
  user_id: number;
  username?: string;
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
  console.log('Connected to MongoDB');
}

// Initialize Express and Telegraf
const app = express();
const bot = new Telegraf(TELEGRAM_API_TOKEN!);
app.use(express.json());
app.use(bot.webhookCallback('/webhook'));

// Button creation utility
function createButtons(elements: string[], width: number) {
  const buttons: KeyboardButton[][] = [];
  const validElements = elements.filter((el) => el && el.trim() !== '');
  if (width > 1 && width <= 3 && validElements.length > 3) {
    for (let i = 0; i < validElements.length; i += width) {
      const row = validElements.slice(i, i + width).map((el) => Markup.button.text(el));
      buttons.push(row);
    }
  } else {
    for (const element of validElements) {
      buttons.push([Markup.button.text(element)]);
    }
  }
  return Markup.keyboard(buttons).resize().reply_markup;
}

// Button markups
const backMarkup = createButtons([`${backButtonEmoji} ተመለስ`], 1);
const adminHomeMarkup = createButtons(
  [
    `${adminQuestionEmoji} ጥያቄ ጨምር`,
    `${answerEmoji} መልሶችን ለማየት`,
    `${commentEmoji} አስተያየቶችን ለማየት`,
    `${questionEmoji} የተጠየቁ ጥያቄዎችን ለማየት`,
    `${infoEmoji} መረጃ ለመጨመር`,
    `${deleteEmoji} ጥያቄ/መልስ ሰርዝ`,
  ],
  3
);
const userHomeMarkup = createButtons(
  [
    `${answerEmoji} መልስ ለመመለስ`,
    `${commentEmoji} አስተያየት ለመስጠት`,
    `${questionEmoji} ጥያቄ ለመጠየቅ`,
    `${infoEmoji} መረጃ ለማግኘት`,
    `${questionEmoji} የአሁኑ ጥያቄ`,
    `${questionEmoji} ያለፉ ጥያቄዎች`,
    `${answerEmoji} መልሶችን ለማየት`,
  ],
  2
);

// Global state
let mode = 0;
let admins: number[] = [];
let deleteOptions: string[] = [];
let questionOptions: { text: string; id: string }[] = [];

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
  const text = ctx.message.text.trim(); // Trim input to avoid whitespace issues
  const messageId = ctx.message.message_id;
  const username = ctx.from?.username || 'Unknown User';

  if (text.includes(backButtonEmoji)) {
    mode = 0;
    deleteOptions = [];
    questionOptions = [];
    if (admins.includes(chatId)) {
      await ctx.reply('እንኳን ደህና መጣህ አስተዳዳሪ።', { reply_markup: adminHomeMarkup });
    } else {
      await ctx.reply('እንኳን ወደ ፭ ኪሎ ግቢ ጉባኤ ጥያቄና መልስ መወዳደሪያ ቦት መጡ ።', {
        reply_markup: userHomeMarkup,
      });
    }
  } else if (admins.includes(chatId)) {
    await handleAdmin(ctx, text, chatId, messageId, username);
  } else {
    await handleUser(ctx, text, chatId, messageId, username);
  }
});

async function handleAdmin(ctx: any, text: string, chatId: number, messageId: number, username: string) {
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
  } else if (text.includes(answerEmoji)) {
    mode = 2;
    questionOptions = [];
    const oldQuestions = await oldQuestionsCollection.find().toArray();
    const currentQuestion = await currentQuestionCollection.findOne({});

    if (currentQuestion) {
      questionOptions.push({ text: `Current Question: ${currentQuestion.text} (Current)`, id: currentQuestion.id });
      console.log(`Added current question: id=${currentQuestion.id}, text=${currentQuestion.text}`);
    }
    oldQuestions.forEach((q, i) => {
      const optionText = `Old Question ${i + 1}: ${q.text} (${moment(q.startTime).format('YYYY-MM-DD HH:mm:ss')} - ${q.endTime ? moment(q.endTime).format('YYYY-MM-DD HH:mm:ss') : 'Now'})`;
      questionOptions.push({ text: optionText, id: q.id });
      console.log(`Added old question: id=${q.id}, text=${q.text}`);
    });

    if (questionOptions.length === 0) {
      await ctx.reply('ምንም ጥያቄዎች የሉም።', { reply_markup: backMarkup });
      return;
    }

    await ctx.reply('ለመልሶች የሚፈልጉትን ጥያቄ ይምረጡ:', {
      reply_markup: createButtons([...questionOptions.map((q) => q.text), `${backButtonEmoji} ተመለስ`], 1),
    });
  } else if (text.includes(commentEmoji)) {
    mode = 3;
    const comments = await commentsCollection.find().toArray();
    if (comments.length === 0) {
      await ctx.reply('ምንም አስተያየቶች የሉም።');
      return;
    }
    for (const comment of comments) {
      await ctx.forwardMessage(chatId, comment.user_id, comment.message_id);
      await ctx.reply(
        `አስተያየት: ${comment.text}\nተጠቃሚ: ${comment.username || 'Unknown'}\nጊዜ: ${moment(comment.timestamp).format('YYYY-MM-DD HH:mm:ss')}`
      );
    }
    await ctx.reply('እስከ አሁን ድረስ የተሰጡ አስተያየቶች እነዚህ ነበሩ።', { reply_markup: backMarkup });
  } else if (text.includes(questionEmoji)) {
    mode = 4;
    const userQuestions = await userQuestionsCollection.find().toArray();
    if (userQuestions.length === 0) {
      await ctx.reply('ምንም የተጠየቁ ጥያቄዎች የሉም።');
      return;
    }
    for (const question of userQuestions) {
      await ctx.forwardMessage(chatId, question.user_id, question.message_id);
      await ctx.reply(
        `ጥያቄ: ${question.text}\nተጠቃሚ: ${question.username || 'Unknown'}\nጊዜ: ${moment(question.timestamp).format('YYYY-MM-DD HH:mm:ss')}`
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

    deleteOptions.push(...answers.map((a, i) => `Answer ${i + 1}: ${a.text} (by ${a.username || 'Unknown'}, ${moment(a.timestamp).format('YYYY-MM-DD HH:mm:ss')})`));
    deleteOptions.push(...userQuestions.map((q, i) => `Question ${i + 1}: ${q.text} (by ${q.username || 'Unknown'}, ${moment(q.timestamp).format('YYYY-MM-DD HH:mm:ss')})`));
    if (currentQuestion) {
      deleteOptions.push(`Current Question: ${currentQuestion.text} (Current)`);
    }
    deleteOptions.push(...oldQuestions.map((q, i) => 
      `Old Question ${i + 1}: ${q.text} (${moment(q.startTime).format('YYYY-MM-DD HH:mm:ss')} - ${q.endTime ? moment(q.endTime).format('YYYY-MM-DD HH:mm:ss') : 'Now'})`
    ));

    if (deleteOptions.length === 0) {
      await ctx.reply('ለመሰረዝ ምንም ጥያቄዎች ወይም መልሶች የሉም።', { reply_markup: backMarkup });
      return;
    }

    await ctx.reply('ለመሰረዝ ይምረጡ:', { reply_markup: createButtons([...deleteOptions, `${backButtonEmoji} ተመለስ`], 1) });
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
        text,
        startTime: moment().toISOString(),
      });
      console.log(`Added new question: id=${newQuestionId}, text=${text}`);
      await ctx.reply('አዲሱ ጥያቄ ተቀምጧል።', { reply_markup: adminHomeMarkup });
    } else if (mode === 5) {
      await commonInfoCollection.insertOne({ text });
      await ctx.reply('አዲሱ መረጃ ተቀምጧል።', { reply_markup: adminHomeMarkup });
    } else if (mode === 2) {
      console.log(`User selected: ${text}`);
      console.log(`Available questionOptions: ${JSON.stringify(questionOptions.map(q => ({ text: q.text, id: q.id })))}`);
      const selectedIndex = questionOptions.findIndex((option) => option.text === text);
      if (selectedIndex >= 0) {
        const selectedQuestion = questionOptions[selectedIndex];
        const questionId = selectedQuestion.id;
        const questionText = selectedQuestion.text.split(': ')[1].split(' (')[0];
        console.log(`Fetching answers for questionId: ${questionId}, text: ${questionText}`);
        
        const answers = await answersCollection.find({ questionId: questionId.trim() }).toArray();
        console.log(`Found ${answers.length} answers: ${JSON.stringify(answers.map(a => ({ questionId: a.questionId, text: a.text })))}`);

        if (answers.length === 0) {
          await ctx.reply(`ለጥያቄ "${questionText}" ምንም መልሶች የሉም።`, { reply_markup: backMarkup });
          return;
        }

        for (const answer of answers) {
          await ctx.forwardMessage(chatId, answer.user_id, answer.message_id);
          await ctx.reply(
            `መልስ: ${answer.text}\nተጠቃሚ: ${answer.username || 'Unknown'}\nጊዜ: ${moment(answer.timestamp).format('YYYY-MM-DD HH:mm:ss')}`
          );
        }
        await ctx.reply(`ለጥያቄ "${questionText}" መልሶች እነዚህ ናቸው።`, { reply_markup: backMarkup });
        mode = 0;
        questionOptions = [];
      } else {
        console.log(`No matching question found for text: ${text}`);
        await ctx.reply('እባክዎ ከቀረቡት ጥያቄዎች ውስጥ አንዱን ይምረጡ።', { reply_markup: backMarkup });
      }
    } else if (mode === 7) {
      const selectedIndex = deleteOptions.findIndex((option) => option === text);
      if (selectedIndex >= 0) {
        const selectedOption = deleteOptions[selectedIndex];
        if (selectedOption.startsWith('Answer')) {
          const answerIndex = parseInt(selectedOption.split(':')[0].replace('Answer ', '')) - 1;
          const answers = await answersCollection.find().toArray();
          await answersCollection.deleteOne({ message_id: answers[answerIndex].message_id });
        } else if (selectedOption.startsWith('Question')) {
          const questionIndex = parseInt(selectedOption.split(':')[0].replace('Question ', '')) - 1;
          const userQuestions = await userQuestionsCollection.find().toArray();
          await userQuestionsCollection.deleteOne({ message_id: userQuestions[questionIndex].message_id });
        } else if (selectedOption.startsWith('Current Question')) {
          await currentQuestionCollection.deleteOne({});
        } else if (selectedOption.startsWith('Old Question')) {
          const oldQuestionIndex = parseInt(selectedOption.split(':')[0].replace('Old Question ', '')) - 1;
          const oldQuestions = await oldQuestionsCollection.find().toArray();
          await oldQuestionsCollection.deleteOne({ id: oldQuestions[oldQuestionIndex].id });
        }
        await ctx.reply('ጥያቄ ወይም መልስ ተሰርዟል።', { reply_markup: adminHomeMarkup });
        mode = 0;
        deleteOptions = [];
      }
    }
  }
}

async function handleUser(ctx: any, text: string, chatId: number, messageId: number, username: string) {
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
      await ctx.reply('የዕለቱ ጥያቄና መልስ ውድድር ማታ 3፡30 ላይ ይጀምራል።', { reply_markup: userHomeMarkup });
    } else {
      await ctx.reply(`የአሁኑ ጥያቄ: \n ${currentQuestion.text}`, { reply_markup: backMarkup });
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
      await ctx.reply('ከአስተዳዳሪዎች የተላለፈው ወቅታዊ መረጃ እነዚህ ናቸው።', { reply_markup: backMarkup });
    }
  } else if (text.includes('የአሁኑ ጥያቄ')) {
    mode = 1;
    const currentQuestion = await currentQuestionCollection.findOne({});
    if (!currentQuestion) {
      await ctx.reply('ምንም የአሁኑ ጥያቄ የለም።', { reply_markup: backMarkup });
    } else {
      await ctx.reply(`የአሁኑ ጥያቄ: \n ${currentQuestion.text}`, { reply_markup: backMarkup });
      await ctx.reply('መልስዎን እዚህ ይላኩ።', { reply_markup: backMarkup });
    }
  } else if (text.includes('ያለፉ ጥያቄዎች')) {
    mode = 0;
    const oldQuestions = await oldQuestionsCollection.find().toArray();
    if (!oldQuestions.length) {
      await ctx.reply('ምንም ያለፉ ጥያቄዎች የሉም።', { reply_markup: backMarkup });
    } else {
      for (const question of oldQuestions) {
        await ctx.reply(`ጥያቄ: ${question.text}\nጊዜ: ${moment(question.startTime).format('YYYY-MM-DD HH:mm:ss')} - ${question.endTime ? moment(question.endTime).format('YYYY-MM-DD HH:mm:ss') : 'Now'}`);
      }
      await ctx.reply('ከላይ ያሉት ያለፉ ጥያቄዎች ናቸው።', { reply_markup: backMarkup });
    }
  } else if (text.includes(answerEmoji) && text.includes('መልሶችን ለማየት')) {
    mode = 2;
    questionOptions = [];
    const oldQuestions = await oldQuestionsCollection.find().toArray();
    const currentQuestion = await currentQuestionCollection.findOne({});

    if (currentQuestion) {
      questionOptions.push({ text: `Current Question: ${currentQuestion.text} (Current)`, id: currentQuestion.id });
      console.log(`Added current question: id=${currentQuestion.id}, text=${currentQuestion.text}`);
    }
    oldQuestions.forEach((q, i) => {
      const optionText = `Old Question ${i + 1}: ${q.text} (${moment(q.startTime).format('YYYY-MM-DD HH:mm:ss')} - ${q.endTime ? moment(q.endTime).format('YYYY-MM-DD HH:mm:ss') : 'Now'})`;
      questionOptions.push({ text: optionText, id: q.id });
      console.log(`Added old question: id=${q.id}, text=${q.text}`);
    });

    if (questionOptions.length === 0) {
      await ctx.reply('ምንም ጥያቄዎች የሉም።', { reply_markup: backMarkup });
      return;
    }

    await ctx.reply('ለመልሶች የሚፈልጉትን ጥያቄ ይምረጡ:', {
      reply_markup: createButtons([...questionOptions.map((q) => q.text), `${backButtonEmoji} ተመለስ`], 1),
    });
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
          message_id: messageId,
          questionId: currentQuestion.id,
          timestamp: moment().toISOString(),
          text,
        });
        console.log(`Inserted answer: questionId=${currentQuestion.id}, text=${text}, user=${username}`);
        await ctx.reply('መልስዎ ተቀምጧል። እናመሰግናለን።', { reply_markup: userHomeMarkup });
      }
    } else if (mode === 2) {
      console.log(`User selected: ${text}`);
      console.log(`Available questionOptions: ${JSON.stringify(questionOptions.map(q => ({ text: q.text, id: q.id })))}`);
      const selectedIndex = questionOptions.findIndex((option) => option.text === text);
      if (selectedIndex >= 0) {
        const selectedQuestion = questionOptions[selectedIndex];
        const questionId = selectedQuestion.id;
        const questionText = selectedQuestion.text.split(': ')[1].split(' (')[0];
        console.log(`Fetching answers for questionId: ${questionId}, text: ${questionText}`);
        
        const answers = await answersCollection.find({ questionId: questionId.trim() }).toArray();
        console.log(`Found ${answers.length} answers: ${JSON.stringify(answers.map(a => ({ questionId: a.questionId, text: a.text })))}`);

        if (answers.length === 0) {
          await ctx.reply(`ለጥያቄ "${questionText}" ምንም መልሶች የሉም።`, { reply_markup: backMarkup });
          return;
        }

        for (const answer of answers) {
          await ctx.forwardMessage(chatId, answer.user_id, answer.message_id);
          await ctx.reply(
            `መልስ: ${answer.text}\nተጠቃሚ: ${answer.username || 'Unknown'}\nጊዜ: ${moment(answer.timestamp).format('YYYY-MM-DD HH:mm:ss')}`
          );
        }
        await ctx.reply(`ለጥያቄ "${questionText}" መልሶች እነዚህ ናቸው።`, { reply_markup: backMarkup });
        mode = 0;
        questionOptions = [];
      } else {
        console.log(`No matching question found for text: ${text}`);
        await ctx.reply('እባክዎ ከቀረቡት ጥያቄዎች ውስጥ አንዱን ይምረጡ።', { reply_markup: backMarkup });
      }
    } else if (mode === 3) {
      await userQuestionsCollection.insertOne({
        user_id: chatId,
        username,
        message_id: messageId,
        timestamp: moment().toISOString(),
        text,
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
  bot.launch();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch(console.error);