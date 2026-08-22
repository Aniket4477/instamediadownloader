async function verifyProductionCatPost() {
  const BASE_URL = 'https://instamediadownloader.vercel.app';
  const testUrl = 'https://www.instagram.com/p/DZm7iwJkolh/?igsi=MW5rNGQ1MHoxazhkOA==';
  console.log(`Verifying production deployment with exact cat post: ${testUrl}\n`);

  try {
    const res = await fetch(`${BASE_URL}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: testUrl, tab: 'photo' })
    });
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Type:', data.type);
    console.log('Count:', data.count);
    console.log('Images length:', data.images?.length);
    console.log('\nImages returned:');
    data.images?.forEach((img, i) => {
      console.log(` [Photo ${i+1}] type=${img.type} => ${img.url.slice(0, 90)}`);
    });
  } catch (e) {
    console.error('Error:', e.message);
  }
}

verifyProductionCatPost();
