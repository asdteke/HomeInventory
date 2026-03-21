import { translate } from 'bing-translate-api';

async function test() {
  try {
    const res = await translate('Hello, {{name}}! Welcome to the <1>home</1>.', null, 'it');
    console.log("Translation:", res.translation);
  } catch (err) {
    console.error(err);
  }
}
test();
