const { Client, GatewayIntentBits, EmbedBuilder,  SlashCommandBuilder, Routes, REST } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');
const cheerio = require("cheerio");
const dayjs = require('dayjs');
require('dotenv').config();
require('dayjs/locale/ru');
dayjs.locale('ru');




const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const FOREX_URL = 'https://www.forexfactory.com/calendar.php?week=';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

const rest = new REST({ version: '10' }).setToken(TOKEN);


client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('today')
            .setDescription('Shows news for today'),
        new SlashCommandBuilder()
            .setName('tm')
            .setDescription('Shows news for tomorrow')
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }

    scheduleNewsPosting();
});

async function fetchForexNews() {
    try {
        console.log('Fetching Forex news...');

        const response = await axios.get(FOREX_URL, {
            headers: {
                'User-Agent': 'PostmanRuntime/7.37.0',
                'Accept': '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            }
        });

        console.log('Forex news fetched successfully.');

        const $ = cheerio.load(response.data);
        const newsItems = [];
        let currentDate = '';
        let currentTime = '';
        const currentYear = dayjs().year();

        $('tr.calendar__row').each((index, element) => {
            const newDate = $(element).find('.calendar__cell.calendar__date').text().trim();
            if (newDate) {
                currentDate = dayjs(`${newDate} ${currentYear}`, 'ddd MMM D YYYY').format('YYYY-MM-DD');
            }

            const newTime = $(element).find('.calendar__cell.calendar__time').text().trim();
            if (newTime) {
                currentTime = newTime;
            }

            const currency = $(element).find('.calendar__cell.calendar__currency').text().trim();
            const impactTitle = $(element).find('.calendar__cell.calendar__impact span')?.attr('class');
            const event = $(element).find('.calendar__event-title').text().trim();


            let impact = '';
            if (impactTitle?.includes('icon--ff-impact-red')) {
                impact = 'High';
            } else if (impactTitle?.includes('icon--ff-impact-ora')) {
                impact = 'Medium';
            }

            if (['EUR', 'USD', 'GBP'].includes(currency)  && event && (impact === 'High' || impact === 'Medium')) {
                const fullDateTime = dayjs.tz(`${currentDate} ${time}`, 'YYYY-MM-DD h:mma', 'UTC').tz('Europe/Berlin');
                newsItems.push({ date: fullDateTime.format('YYYY-MM-DD'), time: fullDateTime.format('HH:mm'), currency, impact, event });
            }
        });

        console.log(`Fetched ${newsItems.length} news items.`);
        return newsItems;
    } catch (error) {
        console.error('Error fetching news:', error);
    }
}


function formatNewsForDay(newsItems) {
    const newsByDay = {};
    newsItems.forEach(news => {
        if (!newsByDay[news.date]) {
            newsByDay[news.date] = [];
        }
        newsByDay[news.date].push(news);
    });
    return newsByDay;
}

async function sendNewsInEmbeds(channel, newsByDay) {
    for (const [date, newsItems] of Object.entries(newsByDay)) {
        const formattedDate = dayjs(date, 'YYYY-MM-DD').format('dddd, D MMMM');
        const embed = new EmbedBuilder()
            .setTitle(`📰 Daily News`)
            .setDescription(`**${formattedDate}**`)
            .setColor('#8A2BE2');

        newsItems.forEach(news => {
            const impactEmoji = news.impact === 'High' ? '🟥' : '🟧';
            const currencyEmoji = news.currency === 'USD' ? '🇺🇸' : news.currency === 'EUR' ? '🇪🇺' : '🇬🇧';
            embed.addFields({
                name: `${news.time}`,
                value: `**Currency:** ${news.currency} ${currencyEmoji}\n**Impact:** ${impactEmoji}\n**Event:** ${news.event}`,
                inline: false
            });
        });

        try {
            await channel.send({ embeds: [embed] });
            console.log(`News for ${date} sent successfully.`);
        } catch (error) {
            console.error(`Error sending news for ${date}:`, error);
        }
    }
}

function scheduleNewsPosting() {
    cron.schedule('0 14 * * *', async () => {
        try {
            console.log('Starting scheduled news posting...');
            const channel = await client.channels.fetch(CHANNEL_ID);
            const newsItems = await fetchForexNews();
            if (newsItems && newsItems.length > 0) {
                const newsByDay = formatNewsForDay(newsItems);
                await sendNewsInEmbeds(channel, newsByDay);
            } else {
                console.log('No news items to send.');
            }
        } catch (error) {
            console.error('Error during scheduled news posting:', error);
        }
    });
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'today') {
        const today = dayjs();
        const todayFormatted = today.format('YYYY-MM-DD');

        if (today.day() === 6 || today.day() === 0) {  // 6 - Saturday, 0 - Sunday
            await interaction.reply({ content: 'Какая торговля, сегодня ж выходной', ephemeral: false });
            return;
        }

        const newsItems = await fetchForexNews();
        const newsByDay = formatNewsForDay(newsItems);
        const todayNews = newsByDay[todayFormatted] || [];
        await sendNewsInEmbeds(interaction.channel, { [todayFormatted]: todayNews });
        await interaction.reply({ content: 'Новости на сегодня', ephemeral: false });
    } else if (commandName === 'tm') {
        const tomorrow = dayjs().add(1, 'day');
        const tomorrowFormatted = tomorrow.format('YYYY-MM-DD');

        if (tomorrow.day() === 6 || tomorrow.day() === 0) {  // 6 - Saturday, 0 - Sunday
            await interaction.reply({ content: 'Какая торговля, завтра ж выходной.', ephemeral: false });
            return;
        }

        const newsItems = await fetchForexNews();
        const newsByDay = formatNewsForDay(newsItems);
        const tomorrowNews = newsByDay[tomorrowFormatted] || [];
        await sendNewsInEmbeds(interaction.channel, { [tomorrowFormatted]: tomorrowNews });
        await interaction.reply({ content: 'Новости на завтра', ephemeral: false });
    }
});

client.login(TOKEN);
