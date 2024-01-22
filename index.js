const express = require("express");
const app = express();
const port = 3000;
const TelegramBot = require("node-telegram-bot-api");
const token = "6545905698:AAFvwJaMe9dpO77Z09PwgGjy5QxNyhauqik";
const fs = require("fs");
const bot = new TelegramBot(token, { polling: true });
const {
  setCache,
  getCache,
  deleteCache,
  flushAllCache,
} = require("./node-cache");
const { mergePdf } = require("./pdf");
process.env.NTBA_FIX_350 = true; // to remove deprecationWarning of bot.sendDocument

async function downloadPDF(file_id, givenName) {
  return new Promise((resolve) => {
    const fileStream = bot.getFileStream(file_id);
    fileStream
      .pipe(fs.createWriteStream(`./pdf/${givenName}`))
      .on("close", () => {
        resolve(true);
      });
  });
}

function getListOfUploadPDF(array) {
  let list = "You've sent me these PDF files so far:";
  array.map(({ originalName }, index) => {
    list += `\n${index}: ${originalName}`;
  });
  if (array.length > 1) {
    list +=
      "\n\nPress Done if you like to merge or keep sending me the PDF files";
  }
  return list;
}

function deletePDFs(files) {
  files.map(({ givenName }) => {
    fs.unlinkSync(`./pdf/${givenName}`);
  });
}

bot.on("message", async (msg) => {
  const {
    chat: { id },
    text,
    document,
    message_id,
  } = msg;
  let replayMsg = "";
  const opts = { reply_to_message_id: message_id };

  if (text === "/start") {
    replayMsg = `Welcome to XPDF Bot!\n\nKey features:\n- Compress, merge, preview, rename, split and add watermark to PDF files\n- And more...`;
  }
  if (text === "/merge") {
    const getUserData = getCache(id);
    if (getUserData) {
      deletePDFs(getUserData.files || []);
      deleteCache(id);
    }
    setCache(id, { action: text });
    replayMsg =
      "Send me the PDF files that you'll like to merge\n\nNote that the files will be merged in the order that you send me";
    opts.reply_markup = {
      resize_keyboard: true,
      is_persistent: true,
      // one_time_keyboard: true,
      keyboard: [["Cancel"]],
    };
  }
  if (text === "Cancel") {
    let getUserData = getCache(id);
    if (getUserData) {
      deletePDFs(getUserData.files || []);
      deleteCache(id);
      replayMsg = "/merge Action cancelled";
      opts.reply_markup = { remove_keyboard: true };
    }
  }
  if (text === "Remove Last PDF") {
    let getUserData = getCache(id);
    if (getUserData) {
      const getFiles = getUserData.files;
      if (getFiles.length === 1) {
        const { givenName } = getFiles.pop();
        fs.unlinkSync(`./pdf/${givenName}`);
        deleteCache(id);
        replayMsg = "/merge Action cancelled";
        opts.reply_markup = { remove_keyboard: true };
      } else {
        const { givenName, originalName } = getFiles.pop();
        fs.unlinkSync(`./pdf/${givenName}`);
        getUserData["files"] = getFiles;
        setCache(id, getUserData);
        replayMsg =
          `PDF ${originalName} has been removed for merging\n\n` +
          getListOfUploadPDF(getUserData.files);
        if (getFiles.length === 1) {
          opts.reply_markup = {
            resize_keyboard: true,
            is_persistent: true,
            keyboard: [["Cancel"]],
          };
        }
      }
    }
  }
  if (text === "Done") {
    const getUserData = getCache(id);
    if (getUserData) {
      const { action, files } = getUserData;
      if (action === "/merge") {
        const { success, message } = await mergePdf(files);
        opts.caption = "Here is your merge PDF";
        opts.reply_markup = { remove_keyboard: true, is_persistent: true };
        if (success) {
          await bot.sendDocument(id, message, opts);
          fs.unlinkSync(message);
        } else {
          replayMsg = message;
        }
        deletePDFs(files);
        deleteCache(id);
      }
    }
  }
  replayMsg ? bot.sendMessage(id, replayMsg, opts) : false;

  if (document) {
    const getUserData = getCache(id);
    if (getUserData) {
      const { mime_type } = document;
      if (mime_type === "application/pdf") {
        const { file_id, file_name } = document;
        const givenName = `${Date.now()}.pdf`;
        await downloadPDF(file_id, givenName);
        const fileObj = { originalName: file_name, givenName };
        const opts = {
          reply_to_message_id: message_id,
          reply_markup: {
            resize_keyboard: true,
            is_persistent: true,
            // one_time_keyboard: true,
            keyboard: [["Cancel"]],
          },
        };
        if (getUserData.files) {
          getUserData.files.push(fileObj);
          opts.reply_markup.keyboard = [
            ["Done"],
            ["Remove Last PDF", "Cancel"],
          ];
        } else {
          getUserData.files = [fileObj];
        }
        setCache(id, getUserData);
        bot.sendMessage(id, getListOfUploadPDF(getUserData.files), opts);
      } else {
        bot.sendMessage(id, "Invalid File Type!");
      }
    }
  }
});

flushAllCache();
app.listen(port);
