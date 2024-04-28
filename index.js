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
  pdfPageKeyboard,
  removePages,
  deleteOldDataOnNewCommand,
  deletePDFs,
  pdfPageSplitKeyboard,
  getSplitPdf,
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
    // .on("error", (error) => {
    //   resolve({ success: false, message: error.message });
    // });
  });
}

function getListOfUploadPDF(array) {
  let list = "You've sent me these PDF files so far:";
  array.map(({ originalName }, index) => {
    list += `\n${index + 1}: ${originalName}`;
  });
  if (array.length > 1) {
    list +=
      "\n\nPress Done if you like to merge or keep sending me the PDF files";
  }
  return list;
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
    replayMsg = `Welcome to XPDF Bot!\n\nKey features:\n- Compress, merge, remove pages, split and add watermark to PDF files\n- And more...`;
  }
  if (text === "/merge") {
    deleteOldDataOnNewCommand(id);
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
    replayMsg = "Action cancelled";
    opts.reply_markup = { remove_keyboard: true };
    let getUserData = getCache(id);
    if (getUserData) {
      deletePDFs(getUserData.files || []);
      deleteCache(id);
      replayMsg = `${getUserData.action} ${replayMsg}`;
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
      const { action, files, removedPages, totalPages, ranges } = getUserData;
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
      } else if (action === "/splitpdf") {
        const { success, message } = await getSplitPdf(files, ranges);
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
    deleteOldDataOnNewCommand(id);
    setCache(id, { action: text });
    replayMsg = `Send me the PDF file that you'll like to remove pages`;
    opts.reply_markup = {
      resize_keyboard: true,
      is_persistent: true,
      keyboard: [["Cancel"]],
    };
  }
  if (text === "/splitpdf") {
    deleteOldDataOnNewCommand(id);
    setCache(id, { action: text });
    replayMsg = `Send me the PDF file that you'll like to separate pages`;
    opts.reply_markup = {
      resize_keyboard: true,
      is_persistent: true,
      keyboard: [["Cancel"]],
    };
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
      let text = "";
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
        text = getListOfUploadPDF(getUserData.files);
        bot.sendMessage(id, text, opts);
      } else if (action === "/removepages") {
        const totalPages = await getTotalPages(givenName);
        if (totalPages > 1) {
          getUserData.files = [fileObj];
          getUserData.totalPages = totalPages;
          getUserData.removedPages = [];
          setCache(id, getUserData);
          text = getListOfUploadPDF(getUserData.files);
          text += `\n\nThere are total ${totalPages} pages in PDF.\nNow send me the number to remove page.`;
          opts.reply_markup.keyboard = pdfPageKeyboard(totalPages);
        } else {
          text = "There is only 1 page /removepages action could not perform.";
          opts.reply_markup = { remove_keyboard: true };
          deleteCache(id);
          deletePDFs([fileObj]);
        }
        bot.sendMessage(id, text, opts);
      } else if (action === "/splitpdf") {
        const totalPages = await getTotalPages(givenName);
        if (totalPages === 1) {
          text = "There is only 1 page /splitpdf action could not perform.";
          opts.reply_markup = { remove_keyboard: true };
          deleteCache(id);
          deletePDFs([fileObj]);
        } else if (totalPages > 20) {
          opts.reply_markup = { remove_keyboard: true };
          text = "For now, @XPDF_BOT only supports up to PDF(s) with 20 pages.";
        } else {
          getUserData.files = [fileObj];
          getUserData.totalPages = totalPages;
          getUserData.ranges = [];
          getUserData.fileId = message_id;
          setCache(id, getUserData);
          text = getListOfUploadPDF(getUserData.files);
          text += `\nThere are total ${totalPages} pages in PDF.\n\nNow send me the ranges.`;
          bot.sendMessage(id, text, { reply_to_message_id: message_id });
          // opts.reply_to_message_id = new_message_id;
          opts.reply_markup.keyboard = pdfPageKeyboard(totalPages);
          bot.sendMessage(id, "Start page:", opts);
        }
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
  let { action, totalPages, removedPages, ranges, fileId } = getUserData;
  if (action === "/removepages") {
    let removedPagesNumber = match[0];
    removedPages.push(removedPagesNumber.toString());
    removedPages = [...new Set(removedPages)];
    getUserData.removedPages = removedPages;
    setCache(id, getUserData);
    const text = `Press Done or keep sending number of the page.\n\nRemoved Pages Number : ${removedPages.toString()}`;
    bot.sendMessage(id, text, {
      reply_markup: {
        reply_to_message_id: message_id,
        resize_keyboard: true,
        is_persistent: true,
        keyboard: pdfPageKeyboard(totalPages, removedPages),
      },
    });
  } else if (action === "/splitpdf") {
    let pagesNumber = match[0];
    if (ranges.length) {
      ranges[0].push(pagesNumber);
      getUserData.ranges = ranges;
      setCache(id, getUserData);
      const text = `New Split PDF\nStart page: *${ranges[0][0]}*\nLast  page: *${ranges[0][1]}*\n\nPress *Done* to split PDF ot *Cancel* to cancel action`;
      bot.sendMessage(id, text, {
        reply_to_message_id: fileId,
        reply_markup: {
          resize_keyboard: true,
          is_persistent: true,
          keyboard: [["Done", "Cancel"]],
        },
        parse_mode: "Markdown",
      });
    } else if (pagesNumber == totalPages) {
      ranges.push([pagesNumber]);
      getUserData.ranges = ranges;
      setCache(id, getUserData);
      const text = `New Split PDF\nStart page: *${ranges[0][0]}*\nLast  page: *${ranges[0][1]? ranges[0][1] : ranges[0][0]}*\n\nPress *Done* to split PDF ot *Cancel* to cancel action`;
      bot.sendMessage(id, text, {
        reply_to_message_id: fileId,
        reply_markup: {
          resize_keyboard: true,
          is_persistent: true,
          keyboard: [["Done", "Cancel"]],
        },
        parse_mode: "Markdown",
      });
    } else {
      ranges.push([pagesNumber]);
      getUserData.ranges = ranges;
      setCache(id, getUserData);
      const text = "Last page:";
      bot.sendMessage(id, text, {
        reply_markup: {
          resize_keyboard: true,
          is_persistent: true,
          keyboard: pdfPageSplitKeyboard(totalPages, pagesNumber),
        },
      });
    }
    // [...new Set(all)]
    // .map((n) => Number(n))
    // .sort((a, b) => a - b);
  } else {
    bot.sendMessage(id, "Invalid Command", {
      reply_markup: { reply_to_message_id: message_id },
    });
  }
});

const readAllFiles = fs.readdirSync("./pdf");
readAllFiles.forEach((file) => {
  if (file.endsWith(".pdf")) {
    fs.unlinkSync(`./pdf/${file}`);
  }
});
flushAllCache();
app.listen(PORT);
