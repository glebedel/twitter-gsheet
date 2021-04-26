import { TwitterClient } from 'twitter-api-client';

const apiKey = PropertiesService.getScriptProperties().getProperty('TWITTER_API_KEY')!;
const apiSecret = PropertiesService.getScriptProperties().getProperty('TWITTER_API_SECRET')!;
const accessToken = PropertiesService.getScriptProperties().getProperty('TWITTER_ACCESS_TOKEN')!;
const accessTokenSecret = PropertiesService.getScriptProperties().getProperty(
  'TWITTER_ACCESS_TOKEN_SECRET',
)!;

const twitterClient = new TwitterClient({
  apiKey,
  apiSecret,
  accessToken,
  accessTokenSecret,
});

export const getAllTweetComments = async (tweetId: string = '1386445179775823875') => {
  const data = await twitterClient.tweets.collectionsEntries({
    id: tweetId,
  });
  return data.objects.tweets;
};
