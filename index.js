const express = require("express");
const app = express();
const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

const {
  parsed: { TELEGRAM_ACCESS_TOKEN, PORT },
} = require("dotenv").config();
const bot = new TelegramBot(TELEGRAM_ACCESS_TOKEN, { polling: true });

const {
  setCache,
  getCache,
  deleteCache,
  flushAllCache,
} = require("./node-cache");
const {
  getMergePdf,
  getTotalPages,
  keyboardLogin,
  removePages,
} = require("./pdf");
process.env.NTBA_FIX_350 = true; // to remove deprecationWarning on bot.sendDocument

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
    fs.unlink(`./pdf/${givenName}`, (err) => {
      if (err) {
        console.log("deletePDFs err: ", err);
      }
    });
  });
}

bot.on("text", async (msg) => {
  const {
    chat: { id },
    text,
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
      replayMsg = `${getUserData.action} Action cancelled`;
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
      deleteCache(id);
      const { action, files, removedPages, totalPages } = getUserData;
      if (action === "/merge") {
        const { success, message } = await getMergePdf(files);
        opts.reply_markup = { remove_keyboard: true };
        if (success) {
          bot.sendMessage(id, "🔄 Merging your PDF files.....");
          bot.sendChatAction(id, "upload_document");
          setTimeout(async () => {
            opts.caption = "Here is your merge PDF";
            await bot.sendDocument(id, message, opts);
            fs.unlinkSync(message);
          }, 3000);
        } else {
          replayMsg = message;
        }
        deletePDFs(files);
      } else if (action === "/removepages") {
        const { success, message } = await removePages(
          files,
          totalPages,
          removedPages
        );
        opts.reply_markup = { remove_keyboard: true };
        if (success) {
          bot.sendMessage(id, "🔄 Processing your PDF files.....");
          bot.sendChatAction(id, "upload_document");
          setTimeout(async () => {
            opts.caption = "Here is your PDF";
            await bot.sendDocument(id, message, opts);
            fs.unlinkSync(message);
          }, 3000);
        } else {
          replayMsg = message;
        }
        deletePDFs(files);
      }
    }
  }
  if (text === "/removepages") {
    setCache(id, { action: text });
    replayMsg = `Send me the PDF file that you'll like to remove pages`;
    opts.reply_markup = { remove_keyboard: true };
  }
  replayMsg ? bot.sendMessage(id, replayMsg, opts) : false;
});

bot.on("document", async (msg) => {
  const {
    chat: { id },
    document,
    message_id,
  } = msg;
  const getUserData = getCache(id);
  if (getUserData) {
    const { mime_type } = document;
    if (mime_type === "application/pdf") {
      const { action } = getUserData;
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
      if (action === "/merge") {
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
      } else if (action === "/removepages") {
        const totalPages = await getTotalPages(givenName);
        let text = "";
        if (totalPages > 1) {
          getUserData.files = [fileObj];
          getUserData.totalPages = totalPages;
          getUserData.removedPages = [];
          setCache(id, getUserData);
          text = getListOfUploadPDF(getUserData.files);
          text += `\n\nThere are total ${totalPages} pages in PDF.\nNow send me the number to remove page.`;
          opts.reply_markup.keyboard = keyboardLogin(totalPages);
        } else {
          text = "There is only 1 page /removepages action could not perform.";
          opts.reply_markup = { remove_keyboard: true };
          deleteCache(id);
          deletePDFs([fileObj]);
        }
        bot.sendMessage(id, text, opts);
      }
    } else {
      bot.sendMessage(id, "Invalid File Type!");
    }
  }
});

bot.onText(/^[0-9]*$/, (msg, match) => {
  const {
    chat: { id },
    message_id,
  } = msg;
  const getUserData = getCache(id);
  let { action, totalPages, removedPages } = getUserData;
  if (action === "/removepages") {
    let removedPagesNumber = match[0];
    removedPages.push(removedPagesNumber.toString());
    getUserData.removedPages = removedPages;
    console.log(getUserData);
    setCache(id, getUserData);
    const text = `Press Done or keep sending number of the page.\n\nRemoved Pages Number : ${removedPages.toString()}`;
    bot.sendMessage(id, text, {
      reply_markup: {
        reply_to_message_id: message_id,
        resize_keyboard: true,
        is_persistent: true,
        keyboard: keyboardLogin(totalPages, removedPages),
      },
    });
  }
});

flushAllCache();
app.listen(PORT);
